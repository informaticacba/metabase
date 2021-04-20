import {
  partialMatch,
  enclosingFunction,
  complete,
  COMPLETION,
} from "metabase/lib/expressions/completer";

describe("metabase/lib/expressions/completer", () => {
  describe("partialMatch", () => {
    it("should get the function name", () => {
      expect(partialMatch("Lowe")).toEqual("Lowe");
      expect(partialMatch("NOT (ISNULL")).toEqual("ISNULL");
    });

    it("should get the field name", () => {
      expect(partialMatch("[Deal]")).toEqual("[Deal]");
      expect(partialMatch("A")).toEqual("A");
      expect(partialMatch("B AND [Ca")).toEqual("[Ca");
      expect(partialMatch("[Sale] or [Good]")).toEqual("[Good]");
      expect(partialMatch("[")).toEqual("[");
    });

    it("should ignore operators and literals", () => {
      expect(partialMatch("X OR")).toEqual(null);
      expect(partialMatch("42 +")).toEqual(null);
      expect(partialMatch("3.14")).toEqual(null);
      expect(partialMatch('"Hello')).toEqual(null);
      expect(partialMatch("'world")).toEqual(null);
    });

    it("should handle empty input", () => {
      expect(partialMatch("")).toEqual(null);
      expect(partialMatch(" ")).toEqual(null);
    });
  });

  describe("enclosingFunction", () => {
    it("should get the correct name", () => {
      expect(enclosingFunction("isnull([ID")).toEqual("isnull");
    });

    it("should ignore completed function construct", () => {
      expect(enclosingFunction("Upper([Name])")).toEqual(null);
    });

    it("should handle multiple arguments", () => {
      expect(enclosingFunction("Concat(First,Middle,Last")).toEqual("Concat");
    });

    it("should handle nested function calls", () => {
      expect(enclosingFunction("Concat(X,Lower(Y,Z")).toEqual("Lower");
      expect(enclosingFunction("P() + Q(R,S(7),T(")).toEqual("T");
      expect(enclosingFunction("P() + Q(R,S(7),T()")).toEqual("Q");
    });

    it("should ignore non-function calls", () => {
      expect(enclosingFunction("1")).toEqual(null);
      expect(enclosingFunction("2 +")).toEqual(null);
      expect(enclosingFunction("X OR")).toEqual(null);
    });

    it("should handle empty input", () => {
      expect(enclosingFunction("")).toEqual(null);
      expect(enclosingFunction(" ")).toEqual(null);
    });
  });

  const FIELDS = [
    "Created At",
    "ID",
    "Product ID",
    "Product → Category",
    "Subtotal",
    "User → State",
  ];
  const SEGMENTS = [
    "Deal",
    "Expensive Thing",
    "Inexpensive",
    "Specials",
    "Luxury",
  ];
  const NUMERIC_FUNCTIONS = ["exp", "log", "sqrt"];

  const FILTER_FUNCTIONS = [
    "between",
    "contains",
    "endsWith",
    "interval",
    "isempty",
    "isnull",
    "startsWith",
  ];

  function suggest(startRule, expression) {
    let suggestions = [];
    const completions = complete(startRule, expression, expression.length);
    completions.forEach(completion => {
      const prefix = completion.match.toLocaleLowerCase();
      const matcher = n => n.toLocaleLowerCase().startsWith(prefix);
      if (completion.type === COMPLETION.NumericFunction) {
        const matches = NUMERIC_FUNCTIONS.filter(matcher);
        suggestions = suggestions.concat(matches);
      }
      if (completion.type === COMPLETION.Operator) {
        suggestions.push(prefix);
      }
      if (completion.type === COMPLETION.FilterFunction) {
        const matches = FILTER_FUNCTIONS.filter(matcher);
        suggestions = suggestions.concat(matches);
      }
      if (completion.type === COMPLETION.Case) {
        const matches = ["case"].filter(matcher);
        suggestions = suggestions.concat(matches);
      }
      if (completion.type === COMPLETION.Field) {
        const matches = FIELDS.filter(matcher);
        suggestions = suggestions.concat(matches);
      }
      if (completion.type === COMPLETION.Segment) {
        const matches = SEGMENTS.filter(matcher);
        suggestions = suggestions.concat(matches);
      }
    });

    return suggestions;
  }

  describe("for a filter", () => {
    const filter = expression => suggest("boolean", expression);

    it("should suggest filter functions, fields, and segments ", () => {
      expect(filter(" ")).toEqual([
        ...FILTER_FUNCTIONS,
        "case",
        ...FIELDS,
        ...SEGMENTS,
      ]);
    });

    it("should complete a segment", () => {
      expect(filter("CASE([Spe")).toEqual(["Specials"]);
      expect(filter("CASE(L")).toEqual(["Luxury"]);
      expect(filter("CASE(Deal")).toEqual(["Deal"]);
    });

    it("should complete a partial identifier", () => {
      expect(filter("e")).toEqual(["endsWith", "Expensive Thing"]);
      expect(filter("c")).toEqual(["contains", "case", "Created At"]);
      expect(filter("s")).toEqual(["startsWith", "Subtotal", "Specials"]);
      expect(filter("in")).toEqual(["interval", "Inexpensive"]);
      expect(filter("lux")).toEqual(["Luxury"]);
      expect(filter("prod")).toEqual(["Product ID", "Product → Category"]);
    });
  });
});
