"use strict";

// user defined type guard, which guarantees 'object is T', not undefined, not null
// see https://2ality.com/2020/06/type-guards-assertion-functions-typescript.html#user-defined-type-guards
export const isDefined = <T>(object: T | undefined | null): object is T =>
	object !== undefined && object !== null;

export const isEmpty = <T>(value: T | undefined | null | ''): value is undefined | null | '' =>
	!isDefined(value) || value === '';
