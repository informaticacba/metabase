import { tokenize, TOKEN, OPERATOR as OP } from "./tokenizer";
import _ from "underscore";

export const COMPLETION = {
  Identifier: 1,
  FilterFunction: 3,
  Case: 4,
  Field: 5,
  Segment: 6,
};

// Given an expression, get the last identifier as the prefix match.
// Examples:
//  "Lower" returns "Lower"
//  "3 > [Rat" returns "[Rat"
//  "[Expensive] " returns null (because of the whitespace)
//  "IsNull([Tax])" returns null (last token is an operator)

export function partialMatch(expression) {
  const { tokens } = tokenize(expression);
  const lastToken = _.last(tokens);
  if (lastToken && lastToken.type === TOKEN.Identifier) {
    if (lastToken.end === expression.length) {
      return expression.slice(lastToken.start, lastToken.end);
    }
  }

  return null;
}

// Given an expression, find the inner-most function name.
// Examples:
//  "Concat([FirstName]," returns "Concat"
//  "Concat([Category], Lower([Type]" returns "Lower"
//  "X() + Concat(Type,Upper(Vendor),Y()" return "Concat"
//  "[Tax] / 3" returns null (not a function call)

export function enclosingFunction(expression) {
  const { tokens } = tokenize(expression);

  const isOpen = t => t.op === OP.OpenParenthesis;
  const isClose = t => t.op === OP.CloseParenthesis;

  let parenCount = 0;
  for (let i = tokens.length - 1; i > 0; --i) {
    const token = tokens[i];
    if (isClose(token)) {
      --parenCount;
    } else if (isOpen(token)) {
      ++parenCount;
      if (parenCount === 1) {
        const prev = tokens[i - 1];
        if (prev.type === TOKEN.Identifier) {
          return expression.slice(prev.start, prev.end);
        }
      }
    }
  }

  return null;
}

export function complete(startRule, source, targetOffset) {
  const partialSource = source.slice(0, targetOffset);
  return startRule === "boolean" ? completeFilter(partialSource) : [];
}

function removeBrackets(s) {
  const s1 = s[0] === "[" ? s.substr(1) : s;
  return s1[s1.length - 1] === "]" ? s1.substr(0, s1.length - 1) : s1;
}

function completeFilter(partialSource) {
  const completions = [];
  const { tokens } = tokenize(partialSource);
  const lastToken = _.last(tokens);
  if (lastToken) {
    if (lastToken.type === TOKEN.Identifier) {
      if (lastToken.end >= partialSource.length) {
        const partial = partialSource.slice(lastToken.start, lastToken.end);
        const match = removeBrackets(partial);
        completions.push({ type: COMPLETION.FilterFunction, match });
        completions.push({ type: COMPLETION.Case, match });
        completions.push({ type: COMPLETION.Field, match });
        completions.push({ type: COMPLETION.Segment, match });
      }
    }
  } else {
    const match = "";
    completions.push({ type: COMPLETION.FilterFunction, match });
    completions.push({ type: COMPLETION.Case, match });
    completions.push({ type: COMPLETION.Field, match });
    completions.push({ type: COMPLETION.Segment, match });
  }

  return completions;
}
