/**
 * Lucene-style track search → SQL WHERE clause, for the Music tab (Mixxx library).
 *
 * A port of the luqum grammar mobile-mixxx used: the same tokens, the same
 * operator precedence (implicit < OR < AND, with a new term after a complete
 * operand always binding to the right, as PLY resolves those shift/reduce
 * conflicts), and the same flattening of same-kind operations — so a query
 * produces the same SQL and parameters it did there.
 *
 * Text fields match by substring, numeric fields support > >= < <= [a TO b],
 * crate:/playlist: look up collections by name, bare words search artist,
 * title and album. A query that fails to parse is searched as plain text.
 */

export type Node =
  | { kind: "word"; value: string }
  | { kind: "phrase"; value: string }
  | { kind: "regex"; value: string }
  | { kind: "field"; name: string; expr: Node }
  | { kind: "and" | "or" | "implicit"; operands: Node[] }
  | { kind: "group" | "fieldGroup"; expr: Node }
  | { kind: "not" | "prohibit" | "plus"; a: Node }
  | { kind: "range"; low: Node; high: Node; includeLow: boolean; includeHigh: boolean }
  | { kind: "from" | "to"; a: Node; include: boolean }
  | { kind: "boost" | "fuzzy" | "proximity"; a: Node };

/** The query is not valid syntax; the caller falls back to plain-text search. */
export class QueryParseError extends Error {}

/** The query parsed but cannot become SQL (e.g. bpm:fast); the request is rejected. */
export class QuerySqlError extends Error {}

type TokenType =
  | "TERM" | "PHRASE" | "REGEX" | "APPROX" | "BOOST" | "MINUS" | "PLUS" | "COLUMN"
  | "LPAREN" | "RPAREN" | "LBRACKET" | "RBRACKET" | "LESSTHAN" | "GREATERTHAN"
  | "AND_OP" | "OR_OP" | "NOT" | "TO";

interface Token {
  type: TokenType;
  value: string;
}

const RESERVED: Record<string, TokenType> = { AND: "AND_OP", OR: "OR_OP", NOT: "NOT", TO: "TO" };

// luqum's TERM_RE: a first char with no special meaning (or an escape), then any
// run of ordinary chars, escapes, or the ":MM[:SS]" of a "THH:MM" time.
const TERM_RE =
  /(?:[^\s:^~(){}[\]/"'+\-\\<>]|\\.)(?:[^\s:^\\~(){}[\]]|\\.|(?<=T\d{2}):\d{2}(?::\d{2})?)*/y;
const PHRASE_RE = /"(?:[^\\"]|\\.)*"/y;
const REGEX_RE = /\/(?:[^\\/]|\\.)*\//y;
const APPROX_RE = /~([0-9.]+)?/y;
const BOOST_RE = /\^([0-9.]+)?/y;
const SEPARATOR_RE = /\s+/y;

const SIMPLE: [RegExp, TokenType][] = [
  [/\+/y, "PLUS"],
  [/-/y, "MINUS"],
  [/:/y, "COLUMN"],
  [/\(/y, "LPAREN"],
  [/\)/y, "RPAREN"],
  [/[[{]/y, "LBRACKET"],
  [/[\]}]/y, "RBRACKET"],
  [/>=?/y, "GREATERTHAN"],
  [/<=?/y, "LESSTHAN"],
];

function matchAt(re: RegExp, input: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos;
  return re.exec(input);
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  outer: while (pos < input.length) {
    const sep = matchAt(SEPARATOR_RE, input, pos);
    if (sep) {
      pos += sep[0].length;
      continue;
    }
    const term = matchAt(TERM_RE, input, pos);
    if (term) {
      tokens.push({ type: RESERVED[term[0]] ?? "TERM", value: term[0] });
      pos += term[0].length;
      continue;
    }
    for (const [re, type] of SIMPLE) {
      const m = matchAt(re, input, pos);
      if (m) {
        tokens.push({ type, value: m[0] });
        pos += m[0].length;
        continue outer;
      }
    }
    for (const [re, type] of [
      [PHRASE_RE, "PHRASE"],
      [REGEX_RE, "REGEX"],
    ] as const) {
      const m = matchAt(re, input, pos);
      if (m) {
        tokens.push({ type, value: m[0] });
        pos += m[0].length;
        continue outer;
      }
    }
    for (const [re, type] of [
      [APPROX_RE, "APPROX"],
      [BOOST_RE, "BOOST"],
    ] as const) {
      const m = matchAt(re, input, pos);
      if (m) {
        tokens.push({ type, value: m[1] ?? "" });
        pos += m[0].length;
        continue outer;
      }
    }
    throw new QueryParseError(`Illegal character '${input[pos]}' at position ${pos}`);
  }
  return tokens;
}

/**
 * PLY precedence levels. A binary operator (or a token starting an implicit AND)
 * binds into the right operand only when its level is above the operator on its
 * left. Tokens luqum gave no precedence sit at level 0, below everything, so
 * `a OR b c` is `(a OR b) c`; `+`, `-` and `TO` rank high, so `a OR b -c` is
 * `a OR (b -c)`.
 */
const IMPLICIT_PREC = 1;
const OP_PREC: Partial<Record<TokenType, number>> = { OR_OP: 2, AND_OP: 3 };
/** Tokens that can start an operand, with the level they carry as a lookahead. */
const OPERAND_START: Partial<Record<TokenType, number>> = {
  TERM: 0, PHRASE: 0, REGEX: 0, LPAREN: 0, LBRACKET: 0, NOT: 0, LESSTHAN: 0, GREATERTHAN: 0,
  PLUS: 4, MINUS: 4, TO: 6,
};

/** luqum's create_operation: merge operands that are already the same kind of operation. */
function combine(kind: "and" | "or" | "implicit", a: Node, b: Node): Node {
  const left = a.kind === kind ? (a as { operands: Node[] }).operands : [a];
  const right = b.kind === kind ? (b as { operands: Node[] }).operands : [b];
  return { kind, operands: [...left, ...right] };
}

export function parse(input: string): Node {
  const tokens = tokenize(input);
  let i = 0;
  const peek = (): Token | undefined => tokens[i];
  const next = (): Token => {
    const t = tokens[i++];
    if (!t) throw new QueryParseError("unexpected end of expression (maybe due to unmatched parenthesis)");
    return t;
  };
  const expect = (type: TokenType): Token => {
    const t = next();
    if (t.type !== type) throw new QueryParseError(`Syntax error: unexpected '${t.value}'`);
    return t;
  };

  const leaf = (t: Token): Node =>
    t.type === "PHRASE" ? { kind: "phrase", value: t.value } : { kind: "word", value: t.value };

  const phraseOrTerm = (): Node => {
    const t = next();
    if (t.type !== "TERM" && t.type !== "PHRASE") throw new QueryParseError(`Syntax error: unexpected '${t.value}'`);
    return leaf(t);
  };

  const rangeBound = (): Node => {
    if (peek()?.type === "MINUS") {
      next();
      return { kind: "prohibit", a: phraseOrTerm() };
    }
    return phraseOrTerm();
  };

  const primary = (): Node => {
    const t = next();
    switch (t.type) {
      case "PLUS":
        return { kind: "plus", a: unary() };
      case "MINUS":
        return { kind: "prohibit", a: unary() };
      case "NOT":
        return { kind: "not", a: unary() };
      case "LPAREN": {
        const expr = expression(-1);
        expect("RPAREN");
        return { kind: "group", expr };
      }
      case "LBRACKET": {
        const low = rangeBound();
        expect("TO");
        const high = rangeBound();
        const close = expect("RBRACKET");
        return { kind: "range", low, high, includeLow: t.value === "[", includeHigh: close.value === "]" };
      }
      case "LESSTHAN":
        return { kind: "to", a: phraseOrTerm(), include: t.value.includes("=") };
      case "GREATERTHAN":
        return { kind: "from", a: phraseOrTerm(), include: t.value.includes("=") };
      case "TERM": {
        if (peek()?.type === "COLUMN") {
          next();
          const expr = unary();
          return { kind: "field", name: t.value, expr: expr.kind === "group" ? { kind: "fieldGroup", expr: expr.expr } : expr };
        }
        if (peek()?.type === "APPROX") {
          next();
          return { kind: "fuzzy", a: leaf(t) };
        }
        return leaf(t);
      }
      case "PHRASE":
        if (peek()?.type === "APPROX") {
          next();
          return { kind: "proximity", a: leaf(t) };
        }
        return leaf(t);
      case "REGEX":
        return { kind: "regex", value: t.value };
      case "TO":
        return { kind: "word", value: t.value };
      default:
        throw new QueryParseError(`Syntax error: unexpected '${t.value}'`);
    }
  };

  // Boost binds tighter than every prefix operator.
  const unary = (): Node => {
    let node = primary();
    while (peek()?.type === "BOOST") {
      next();
      node = { kind: "boost", a: node };
    }
    return node;
  };

  /** Parses an operand plus every following operator that binds tighter than `prec`. */
  const expression = (prec: number): Node => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t) break;
      const opPrec = OP_PREC[t.type];
      const startPrec = OPERAND_START[t.type];
      if (opPrec !== undefined) {
        if (opPrec <= prec) break;
        next();
        left = combine(t.type === "OR_OP" ? "or" : "and", left, expression(opPrec));
      } else if (startPrec !== undefined) {
        if (startPrec <= prec) break;
        left = combine("implicit", left, expression(IMPLICIT_PREC));
      } else {
        break;
      }
    }
    return left;
  };

  if (tokens.length === 0) throw new QueryParseError("empty expression");
  const tree = expression(-1);
  if (i < tokens.length) throw new QueryParseError(`Syntax error: unexpected '${tokens[i].value}'`);
  return tree;
}

// ---------- SQL ----------

export const TEXT_COLS: Record<string, string> = {
  artist: "l.artist",
  title: "l.title",
  album: "l.album",
  genre: "l.genre",
  key: "l.key",
  year: "l.year",
};
export const NUMERIC_COLS: Record<string, string> = { bpm: "l.bpm", duration: "l.duration" };
const COLLECTION_FIELDS: Record<string, string> = {
  crate:
    "l.id IN (SELECT ct.track_id FROM crate_tracks ct " +
    "JOIN crates c ON ct.crate_id = c.id WHERE c.name LIKE ?)",
  playlist:
    "l.id IN (SELECT pt.track_id FROM PlaylistTracks pt " +
    "JOIN Playlists p ON pt.playlist_id = p.id WHERE p.name LIKE ?)",
};

export interface SqlClause {
  sql: string;
  params: (string | number)[];
}

/** Plain text of a word or phrase (a phrase loses its surrounding quotes). */
function text(node: Node): string {
  if (node.kind === "phrase") return node.value.replace(/^"+|"+$/g, "");
  if (node.kind === "word") return node.value;
  throw new QuerySqlError(`Expected a word or "phrase" in the search, not ${node.kind}.`);
}

function number(node: Node): number {
  const raw = text(node).trim();
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n)) throw new QuerySqlError(`"${raw}" is not a number.`);
  return n;
}

function freeText(value: string): SqlClause {
  const like = `%${value}%`;
  return { sql: "l.artist LIKE ? OR l.title LIKE ? OR l.album LIKE ?", params: [like, like, like] };
}

function numericSql(col: string, node: Node): SqlClause {
  if (node.kind === "from") return { sql: `${col} ${node.include ? ">=" : ">"} ?`, params: [number(node.a)] };
  if (node.kind === "to") return { sql: `${col} ${node.include ? "<=" : "<"} ?`, params: [number(node.a)] };
  if (node.kind === "range") {
    return { sql: `${col} BETWEEN ? AND ?`, params: [number(node.low), number(node.high)] };
  }
  return { sql: `${col} = ?`, params: [number(node)] };
}

function join(children: Node[], op: "AND" | "OR"): SqlClause | null {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  for (const child of children) {
    const clause = nodeToSql(child);
    if (clause) {
      parts.push(`(${clause.sql})`);
      params.push(...clause.params);
    }
  }
  return parts.length ? { sql: parts.join(` ${op} `), params } : null;
}

/** Converts a parsed query to SQL; parts it does not understand (e.g. unknown fields) drop out. */
export function nodeToSql(node: Node): SqlClause | null {
  switch (node.kind) {
    case "field": {
      const field = node.name.toLowerCase();
      if (field in TEXT_COLS) return { sql: `${TEXT_COLS[field]} LIKE ?`, params: [`%${text(node.expr)}%`] };
      if (field in NUMERIC_COLS) return numericSql(NUMERIC_COLS[field], node.expr);
      if (field in COLLECTION_FIELDS) return { sql: COLLECTION_FIELDS[field], params: [`%${text(node.expr)}%`] };
      return null;
    }
    case "and":
    case "implicit":
      return join(node.operands, "AND");
    case "or":
      return join(node.operands, "OR");
    case "group":
    case "fieldGroup":
      return nodeToSql(node.expr);
    case "not":
    case "prohibit": {
      const inner = nodeToSql(node.a);
      return inner ? { sql: `NOT (${inner.sql})`, params: inner.params } : null;
    }
    case "word":
    case "phrase":
      return freeText(text(node));
    default:
      return null;
  }
}

/** A search box query → WHERE clause (null when there is nothing to filter on). */
export function parseSearchQuery(query: string | null | undefined): SqlClause | null {
  const q = (query ?? "").trim();
  if (!q) return null;
  let tree: Node;
  try {
    tree = parse(q);
  } catch (err) {
    if (err instanceof QueryParseError) return freeText(q);
    throw err;
  }
  return nodeToSql(tree);
}
