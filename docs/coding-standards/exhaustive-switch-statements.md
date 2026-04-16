# Exhaustive Switch Statements

- **Status:** proposed
- **Date Created:** 2026-04-02
- **Last Updated:** 2026-04-02
- **Authors:**
  - River Bailey (mxriverlynn)
- **Reviewers:**
- **Applies To:**
  - `packages/evals/src/boolean-evals.ts` (expectation type dispatch)
  - Any switch statement over a discriminated union type

## Introduction

This coding standard defines how `switch` statements over discriminated union types are written to ensure compile-time exhaustiveness and safe runtime behavior when new variants are added.

### Purpose

When a `switch` statement covers a discriminated union (e.g., `TestExpectation['type']`), omitting a variant produces no compiler error by default — the code silently falls through. This caused a bug where adding `agent-call` to the `TestExpectation` union left `passed` uninitialized in the evaluation switch, producing `undefined` results instead of a type error.

### Scope

All TypeScript `switch` statements in the harness workspace that dispatch on a discriminated union's tag field (typically a `type` property). The most common case is expectation type dispatch in the evals package, but the pattern applies anywhere a union is switched on.

## Background

The `evaluateExpectation` function in `boolean-evals.ts` switches on `expectation.type` to dispatch to the correct evaluator. When the `agent-call` type was added to the `TestExpectation` union, the switch had no `default` case, so the new type silently fell through with `passed` as `undefined`. TypeScript only flags this as an error if `noImplicitReturns` or exhaustive checking is enforced — neither of which catches an uninitialized variable in a broader scope.

## Coding Standard

### Add a `default` Case with `never` Type Assertion

Every `switch` statement over a discriminated union must include a `default` case that assigns the switch value to a `never`-typed variable and throws. This produces a compile-time error when a new union variant is added without updating the switch, and a runtime error if an unexpected value reaches the switch.

**Correct usage:**

```typescript
function evaluateExpectation(expectation: TestExpectation, events: StreamJsonEvent[]): boolean {
  switch (expectation.type) {
    case 'result-contains':
      return evaluateResultContains(expectation.value, events)
    case 'result-does-not-contain':
      return evaluateResultDoesNotContain(expectation.value, events)
    case 'skill-call':
      return evaluateSkillCall(expectation.value, expectation.skillFile!, events)
    case 'agent-call':
      return evaluateAgentCall(expectation.agentFile!, expectation.value, events)
    default: {
      const _exhaustive: never = expectation
      throw new Error(`Unrecognized expectation type: ${(_exhaustive as TestExpectation).type}`)
    }
  }
}
```

**What to avoid:**

```typescript
// Don't omit the default case — new union variants silently fall through
switch (expectation.type) {
  case 'result-contains':
    return evaluateResultContains(expectation.value, events)
  case 'skill-call':
    return evaluateSkillCall(expectation.value, expectation.skillFile!, events)
  // Adding 'agent-call' to the union produces NO error here
}

// Don't use a default that returns a fallback value — it hides missing cases
switch (expectation.type) {
  case 'result-contains':
    return evaluateResultContains(expectation.value, events)
  default:
    return false  // silently swallows new types
}

// Don't use a type assertion without throwing — it catches at compile time
// but silently continues at runtime if reached
switch (expectation.type) {
  case 'result-contains':
    return evaluateResultContains(expectation.value, events)
  default:
    const _exhaustive: never = expectation  // compile error only, no runtime protection
}
```

**Project references:**
- `packages/evals/src/boolean-evals.ts:30` — exhaustive switch over `TestExpectation` type

### Use Block Scope in the Default Case

Wrap the `default` case body in braces `{ }` to create a block scope for the `_exhaustive` variable. This avoids naming collisions if multiple switches exist in the same function.

**Correct usage:**

```typescript
default: {
  const _exhaustive: never = expectation
  throw new Error(`Unrecognized expectation type: ${(_exhaustive as TestExpectation).type}`)
}
```

### Include the Discriminant Value in the Error Message

Cast the `never`-typed variable back to the union type to access the discriminant value in the error message. This makes runtime errors actionable — the developer can see which value was unexpected.

## Additional Resources

### Project Documentation

- [Custom Error Hierarchy](./custom-error-hierarchy.md) — error class conventions for thrown errors
- [Test File Organization](./test-file-organization.md) — how to test the default branch
