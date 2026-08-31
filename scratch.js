const fs = require('fs');
let code = fs.readFileSync('packages/router/src/pattern.ts', 'utf8');

const withHeadCode = `
function withHead(
  rest: MatchResult,
  points: number,
  binding?: [string, string],
): MatchResult {
  return {
    params: binding
      ? { [binding[0]]: binding[1], ...rest.params }
      : rest.params,
    score: [points, ...rest.score],
  };
}
`;

code = code.replace(
  '/**\n * Matches `segments` from `si` against `pathParts` from `pi`.',
  withHeadCode + '\n/**\n * Matches `segments` from `si` against `pathParts` from `pi`.'
);

code = code.replace(
`  const withHead = (
    rest: MatchResult,
    points: number,
    binding?: [string, string],
  ): MatchResult => ({
    params: binding
      ? { [binding[0]]: binding[1], ...rest.params }
      : rest.params,
    score: [points, ...rest.score],
  });

`,
  ''
);

fs.writeFileSync('packages/router/src/pattern.ts', code);
