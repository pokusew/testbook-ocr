"use strict";

import path from 'path';
import fs from 'fs/promises';

import util from 'util';
import { isDefined } from './common';

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
const QUESTION_START_PATTERN = /^([0-9]+)\.( |$)/;
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

class QuestionsParser {

	categoryId: number = 0;
	questionId: number = 0;

	currentCategory: CategoryPartial | undefined;
	currentQuestion: QuestionPartial | undefined;
	currentChoice: ChoicePartial | undefined;

	categories: CategoryPartial[] = [];
	questions: QuestionPartial[] = [];

	numChoicesPerQuestion: number = 4;
	allowedChoicesNames: Set<string>;
	ensureChoicesCorrectOrder: boolean;
	nextChoiceName: (name: string | undefined) => string | undefined;

	constructor() {

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

	parseLines(lines: string[]) {

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

			console.error(`no matching parser for line number ${i}: '${line}'`);
			throw new Error(`no matching parser for line number ${i}`);

		}
	}

	tryContinuation(line: string): boolean {

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

	tryChoice(line: string): boolean {

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
			console.error('cannot parse choice name:', line);
			throw new Error('cannot parse choice name');
		}

		const strippedLine = line.slice(match[0].length);

		this.newChoice(name, strippedLine);

		return true;

	}

	newChoice(prefix: string, startingText: string) {

		if (!isDefined(this.currentQuestion)) {
			console.error('no question:', startingText);
			throw new Error('new choice but no question');
		}

		if (this.currentQuestion.choices.length >= this.numChoicesPerQuestion) {
			console.error('numChoicesPerQuestion exceeded:', this.currentQuestion);
			throw new Error('numChoicesPerQuestion exceeded');
		}

		const name = prefix.toLowerCase();

		if (!this.allowedChoicesNames.has(name)) {
			console.error(`invalid choice name '${name}':`, this.currentQuestion);
			throw new Error(`invalid choice name '${name}'`);
		}

		if (this.ensureChoicesCorrectOrder) {

			const expectedName = this.nextChoiceName(this.currentChoice?.name);

			if (name !== expectedName) {
				console.error(`name (${name}) !== expectedName (${expectedName}):`, this.currentQuestion);
				throw new Error(`name (${name}) !== expectedName (${expectedName})`);
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

	tryQuestion(line: string): boolean {

		// // check previous question
		// // maybe this is rather continuation than new question
		// if (isDefined(this.currentQuestion) && this.currentQuestion.choices.length < this.minChoicesPerQuestion) {
		// 	return false;
		// }

		const match = QUESTION_START_PATTERN.exec(line);

		if (!isDefined(match)) {
			return false;
		}

		const number = Number.parseInt(match[1]);

		if (!Number.isInteger(number)) {
			console.error('cannot parse question number:', line);
			throw new Error('cannot parse question number');
		}

		const strippedLine = line.slice(match[0].length);

		this.newQuestion(number, strippedLine);

		return true;

	}

	newQuestion(number: number, startingText: string) {

		// check previous question
		if (isDefined(this.currentQuestion)) {

			if (this.currentQuestion.choices.length !== this.numChoicesPerQuestion) {
				console.error('numChoicesPerQuestion violated:', this.currentQuestion);
				throw new Error('numChoicesPerQuestion violated');
			}

		}

		if (!isDefined(this.currentCategory)) {
			console.error('no category:', startingText);
			throw new Error('new question but no category');
		}

		this.currentQuestion = {
			id: ++this.questionId,
			category: this.currentCategory.id,
			number,
			text: startingText,
			choices: [],
		};

		this.questions.push(this.currentQuestion);

		this.currentCategory.numQuestions++;

		this.currentChoice = undefined;

	}

	newCategory(name) {
		name = name.trim();
		console.log(`  adding category '${name}'`);
		this.currentCategory = {
			id: ++this.categoryId,
			name,
			numQuestions: 0,
		};
		this.categories.push(this.currentCategory);
	}

	flushQuestions() {
		const questions = this.questions;
		this.questions = [];
		return questions;
	}

	getCategories() {
		return this.categories;
	}

	getTotalNumQuestions(): number {
		return this.questionId;
	}

	isClean() {
		// TODO
		return this.questions.length === 0;
	}

}

const toPrettyJSON = (obj: any) => JSON.stringify(obj, undefined, '\t');

const run = async (pagesDir: string, questionsDir: string) => {

	console.log(`pagesDir = ${pagesDir}`);
	console.log(`questionsDir = ${questionsDir}`);

	const questionsFileNameBase = path.join(questionsDir, 'page-');

	const getQuestionsFileName = (pageNumber: number) =>
		`${questionsFileNameBase}${pageNumber.toString().padStart(4, '0')}.json`;

	const files = await fs.readdir(pagesDir);

	const pageFiles = files.filter(name => PAGE_FILE_NAME.test(name));

	// sort names (A-Z) (in place)
	pageFiles.sort();

	const parser = new QuestionsParser();

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

		parser.parseLines(lines);

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
	console.error('usage: {pagesDir} {questionsDir}');
	process.exit(1);
}

run(process.argv[2], process.argv[3])
	.then(() => {
		console.log('script finished');
		process.exit(0);
	})
	.catch(err => {
		console.error('an error occurred while running script', err);
		process.exit(1);
	});
