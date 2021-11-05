"use strict";

import path from 'path';
import fs from 'fs/promises';

import chalk from 'chalk';
import util from 'util';
import { isDefined, prefixLines, printErr, printLineErr } from './common';

util.inspect.defaultOptions.depth = Infinity;

const PAGE_FILE_NAME = /page-([0-9]{4})\.txt/;

interface CategoryPartial {
	id: number;
	name: string;
	numQuestions: number;
}

interface ChoicePartial {
	id: number;
	name: string;
	text: string;
	correct: boolean;
}

interface QuestionPartial {
	id: number;
	category: number;
	number: number;
	text: string;
	choices: ChoicePartial[];
}

// https://www.fileformat.info/info/unicode/category/index.htm
// https://unicodebook.readthedocs.io/unicode.html

const ENDS_WITH_WORD_BREAK = /[\S]-$/u;
const CATEGORY_HEADING_PATTERN = /^[\p{Lu} -]{5,}$/u;
const QUESTION_START_PATTERN_DOT = /^([0-9]+)\.( |$)/;
const QUESTION_START_PATTERN_RP = /^([0-9]+)\)( |$)/;
const getQuestionStartPattern = (separator) => {

	if (separator === '.') {
		return QUESTION_START_PATTERN_DOT;
	}

	if (separator === ')') {
		return QUESTION_START_PATTERN_RP;
	}

	// this would be very insecure
	// return new RegExp(`^([0-9]+)\\${separator}( |$)`);

	throw new Error(`Unsupported question number separator '${separator}'. Supported values are: '.', ')'`);

};
// note: sometimes the trailing ')' might be missing due to the OCR errors
//       e.g. we allow 'D some choice' instead of correct 'D) some choice'
const CHOICE_START_PATTERN = /^([ABCDabcd])(\))? /;

const isUpperCase = (str: string) => str !== str.toLowerCase();

const cleanupString = (str: string) => str.trim();

const appendContinuationLine = (line1: string, line2: string) => {

	// handles word breaking character '-' (between two consecutive lines)
	if (ENDS_WITH_WORD_BREAK.test(line1)) {
		// TODO: always check that this intended fix makes sense in the given text
		console.log(`word-break: '${line1}' '${line2}'`);
		return cleanupString(line1.slice(0, -1)) + ' ' + cleanupString(line2);
	}

	// normal continuation (add space)
	return cleanupString(line1.slice(0, -1)) + ' ' + cleanupString(line2);

};

class ParseError extends Error {

	public readonly context: [string, any][];
	public readonly position: [string, any][];

	constructor(message: string, context?: [string, any][], position?: [string, any][]) {
		super(message);
		Error.captureStackTrace(this, this.constructor);
		this.name = 'ParseError';
		this.context = context ?? [];
		this.position = position ?? [];
	}

	private static recordToPrettyString(record: [string, any][]) {

		let text = '';

		record.forEach(([key, value]) => {
			text += `${key}: ${util.inspect(value, { colors: true })}\n`;
		});

		return text + '\n';

	}

	toPrettyString() {
		return `${chalk.bgRed('  ParseError  ')}\n\n`
			+ `${chalk.red(this.message)}\n\n`
			+ `${chalk.cyan.bold('position:')}\n`
			+ ParseError.recordToPrettyString(this.position)
			+ `${chalk.magenta.bold('context:')}\n`
			+ ParseError.recordToPrettyString(this.context);
	}

}

interface QuestionsParserOptions {
	questionNumberSeparator?: string;
}

class QuestionsParser {

	private categoryId: number = 0;
	private questionId: number = 0;

	private currentCategory: CategoryPartial | undefined;
	private currentQuestion: QuestionPartial | undefined;
	private currentChoice: ChoicePartial | undefined;

	private categories: CategoryPartial[] = [];
	private questions: QuestionPartial[] = [];

	private readonly questionStartPattern: RegExp;
	private readonly numChoicesPerQuestion: number = 4;
	private readonly allowedChoicesNames: Set<string>;
	private readonly ensureChoicesCorrectOrder: boolean;
	private readonly nextChoiceName: (name: string | undefined) => string | undefined;

	constructor({ questionNumberSeparator }: QuestionsParserOptions = {}) {

		this.questionStartPattern = getQuestionStartPattern(questionNumberSeparator ?? '.');
		this.numChoicesPerQuestion = 4;
		this.allowedChoicesNames = new Set<string>(['a', 'b', 'c', 'd']);
		this.ensureChoicesCorrectOrder = true;
		this.nextChoiceName = (name: string | undefined) => {

			if (name === undefined) {
				return 'a';
			}

			const nextName = String.fromCharCode(name.charCodeAt(0) + 1);

			if (this.allowedChoicesNames.has(nextName)) {
				return nextName;
			}

			return undefined;

		};

	}

	public parseLines(lines: string[]) {

		for (let i = 0; i < lines.length; i++) {

			const line = lines[i];


			if (line.startsWith('###')) {
				console.log(`  > skipping comment line ${i}`);
				continue;
			}

			if (line === '') {
				// do not spam for the expected last line
				if (i !== lines.length - 1) {
					console.log(`  > skipping empty line ${i}`);
				}
				continue;
			}

			try {

				if (CATEGORY_HEADING_PATTERN.test(line)) {
					this.newCategory(line);
					continue;
				}

				if (this.tryQuestion(line)) {
					continue;
				}

				if (this.tryChoice(line)) {
					continue;
				}

				if (this.tryContinuation(line)) {
					continue;
				}

			} catch (err) {

				// add details
				if (err instanceof ParseError) {
					err.position.push(['line', i]);
					err.context.push(['line', line]);
					err.context.push(['currentQuestion', this.currentQuestion]);
				}

				// rethrow
				throw err;

			}

			throw new ParseError(
				`no matching parser`,
				[
					['line', line],
					['currentQuestion', this.currentQuestion],
				],
				[
					['line', i],
				],
			);

		}
	}

	private tryContinuation(line: string): boolean {

		if (isDefined(this.currentChoice)) {
			this.currentChoice.text = appendContinuationLine(this.currentChoice.text, line);
			return true;
		}

		if (isDefined(this.currentQuestion)) {
			this.currentQuestion.text = appendContinuationLine(this.currentQuestion.text, line);
			return true;
		}

		return false;

	}

	private tryChoice(line: string): boolean {

		if (!isDefined(this.currentQuestion)) {
			return false;
		}

		if (this.currentQuestion.choices.length === this.numChoicesPerQuestion) {
			return false;
		}

		const match = CHOICE_START_PATTERN.exec(line);

		if (!isDefined(match)) {
			return false;
		}

		const name = match[1];

		if (!isDefined(name)) {
			throw new ParseError('cannot parse choice name', [['line', line]]);
		}

		const strippedLine = line.slice(match[0].length);

		this.newChoice(name, strippedLine);

		return true;

	}

	private newChoice(prefix: string, startingText: string) {

		if (!isDefined(this.currentQuestion)) {
			throw new ParseError('new choice but no question', [['startingText', startingText]]);
		}

		if (this.currentQuestion.choices.length >= this.numChoicesPerQuestion) {
			throw new ParseError('numChoicesPerQuestion exceeded');
		}

		const name = prefix.toLowerCase();

		if (!this.allowedChoicesNames.has(name)) {
			throw new ParseError(`invalid choice name '${name}'`);
		}

		if (this.ensureChoicesCorrectOrder) {

			const expectedName = this.nextChoiceName(this.currentChoice?.name);

			if (name !== expectedName) {
				throw new ParseError(`unexpected choice ${name}, expected ${expectedName}`);
			}

		}

		this.currentChoice = {
			id: this.currentQuestion.choices.length + 1,
			name: name,
			text: startingText,
			correct: isUpperCase(prefix),
		};

		this.currentQuestion.choices.push(this.currentChoice);

	}

	private tryQuestion(line: string): boolean {

		// // check previous question
		// // maybe this is rather continuation than new question
		// if (isDefined(this.currentQuestion) && this.currentQuestion.choices.length < this.minChoicesPerQuestion) {
		// 	return false;
		// }

		const match = this.questionStartPattern.exec(line);

		if (!isDefined(match)) {
			return false;
		}

		const number = Number.parseInt(match[1]);

		if (!Number.isInteger(number)) {
			console.error('cannot parse question number:', line);
			throw new ParseError('cannot parse question number');
		}

		const strippedLine = line.slice(match[0].length);

		this.newQuestion(number, strippedLine);

		return true;

	}

	private newQuestion(number: number, startingText: string) {

		// check previous question
		if (isDefined(this.currentQuestion)) {

			if (this.currentQuestion.choices.length !== this.numChoicesPerQuestion) {
				throw new ParseError('numChoicesPerQuestion violated');
			}

		}

		if (!isDefined(this.currentCategory)) {
			throw new ParseError('new question but no category', [['startingText', startingText]]);
		}

		this.currentQuestion = {
			id: ++this.questionId,
			category: this.currentCategory.id,
			number,
			text: startingText,
			choices: [],
		};

		if (this.currentQuestion.id !== this.currentQuestion.number) {
			throw new ParseError(
				`unexpected question number ${this.currentQuestion.number}, expected ${this.currentQuestion.id}`,
			);
		}

		this.questions.push(this.currentQuestion);

		this.currentCategory.numQuestions++;

		this.currentChoice = undefined;

	}

	private newCategory(name: string) {
		name = name.trim();
		console.log(`  adding category '${name}'`);
		this.currentCategory = {
			id: ++this.categoryId,
			name,
			numQuestions: 0,
		};
		this.categories.push(this.currentCategory);
	}

	public flushQuestions() {
		const questions = this.questions;
		this.questions = [];
		return questions;
	}

	public getCategories() {
		// note: it may be better to return deep copy to prevent accidental mutations
		return this.categories;
	}

	public getTotalNumQuestions(): number {
		return this.questionId;
	}

}

const toPrettyJSON = (obj: any) => JSON.stringify(obj, undefined, '\t');

const run = async (pagesDir: string, questionsDir: string, questionNumberSeparator: string = '.') => {

	console.log(`pagesDir = ${pagesDir}`);
	console.log(`questionsDir = ${questionsDir}`);
	console.log(`questionNumberSeparator = ${questionNumberSeparator}`);

	const questionsFileNameBase = path.join(questionsDir, 'page-');

	const getQuestionsFileName = (pageNumber: number) =>
		`${questionsFileNameBase}${pageNumber.toString().padStart(4, '0')}.json`;

	const files = await fs.readdir(pagesDir);

	const pageFiles = files.filter(name => PAGE_FILE_NAME.test(name));

	// sort names (A-Z) (in place)
	pageFiles.sort();

	const parser = new QuestionsParser({
		questionNumberSeparator: questionNumberSeparator,
	});

	// ensure output dir exists or create it (including any parent dirs if needed)
	await fs.mkdir(questionsDir, { recursive: true });

	for (const file of pageFiles) {

		console.log(`processing ${file}`);

		const pageNumber = Number.parseInt(file.match(PAGE_FILE_NAME)?.[1] ?? '');

		if (!Number.isInteger(pageNumber)) {
			throw new Error(`Cannot parse page number from file name '${file}'`);
		}

		const pageString = await fs.readFile(path.join(pagesDir, file), {
			encoding: 'utf-8',
		});

		const lines = pageString.split('\n');

		try {
			parser.parseLines(lines);
		} catch (err) {
			if (err instanceof ParseError) {
				err.position.unshift(
					['file', file],
					['page', pageNumber],
				);
			}
			throw err;
		}

		const questions = parser.flushQuestions();

		console.log(`  > ${questions.length} questions parsed`);

		const outputFile = getQuestionsFileName(pageNumber);

		await fs.writeFile(outputFile, toPrettyJSON(questions));

	}

	const categoryFile = path.join(questionsDir, 'categories.json');

	await fs.writeFile(categoryFile, toPrettyJSON(parser.getCategories()));

	console.log(`> written ${categoryFile}`);

	console.log(`> total num categories = ${parser.getCategories().length}`);
	console.log(`> total num questions = ${parser.getTotalNumQuestions()}`);

	console.log(`finished`);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3])) {
	console.error('usage: {pagesDir} {questionsDir} [question number separator - defaults to . (dot)]');
	process.exit(1);
}

run(process.argv[2], process.argv[3], process.argv[4])
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {

		if (err instanceof ParseError) {
			printLineErr();
			printErr(prefixLines(err.toPrettyString(), '  '));
			printLineErr();
		} else {
			console.error('an error occurred while running script', err);
		}

		process.exit(1);

	});
