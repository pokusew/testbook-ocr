"use strict";

import { EOL } from 'os';


// user defined type guard, which guarantees 'object is T', not undefined, not null
// see https://2ality.com/2020/06/type-guards-assertion-functions-typescript.html#user-defined-type-guards
export const isDefined = <T>(object: T | undefined | null): object is T =>
	object !== undefined && object !== null;

export const isEmpty = <T>(value: T | undefined | null | ''): value is undefined | null | '' =>
	!isDefined(value) || value === '';

export const toPrettyJSON = (obj: any) => JSON.stringify(obj, undefined, '\t');

export const print = (text: string) => process.stdout.write(text);

export const printErr = (text: string) => process.stderr.write(text);

export const printLine = (text: string = '') => process.stdout.write(text + EOL);

export const printLineErr = (text: string = '') => process.stdout.write(text + EOL);

export const prefixLines = (text: string, prefix: string) => text.split(EOL).map(line => prefix + line).join(EOL);
