"use strict";

import path from 'path';
import fs from 'fs/promises';

import util from 'util';
import { isDefined } from './common';

import mammoth, { MammothDocument, MammothElement, MammothParagraph, MammothRun, MammothText } from 'mammoth';


util.inspect.defaultOptions.depth = Infinity;


const visitDescendants = (element: MammothElement, visit: (element: MammothElement) => void) => {
	if (element.type === 'text') {
		return;
	}
	element.children.forEach(child => {
		visitDescendants(child, visit);
		visit(child);
	});
};

const visitDescendantsOfType = <Type extends MammothElement>(
	element: MammothElement,
	type: Type['type'],
	visit: (element: Type) => void,
) =>
	visitDescendants(
		element,
		(element => {
			if (element.type === type) {
				visit(element as Type);
			}
		}),
	);

const normalizeWhitespaceMutable = (element: MammothText): MammothText => {
	element.value = element.value.replace(WHITESPACE, ' ').trim();
	return element;
};

const isEmptyParagraph = (paragraph: MammothParagraph): boolean =>
	// also returns true when paragraph.children.length === 0
	paragraph.children.every(
		// also returns true when run.children.length === 0
		run => run.children.every(
			text => text.value === '',
		),
	);

const removeEmptyParagraphs = (doc: MammothDocument): MammothDocument => ({
	...doc,
	children: doc.children.filter(p => !isEmptyParagraph(p)),
});

interface CategoryName {
	type: 'category-name';
	name: string;
}

interface QuestionName {
	type: 'question-name';
	number: number;
}

interface QuestionInstruction {
	type: 'question-instruction';
	text: string;
}

interface QuestionText {
	type: 'question-text';
	text: string;
}

interface QuestionChoice {
	type: 'question-choice';
	id: number;
	text: string;
	correct: boolean;
}

type Block = CategoryName | QuestionName | QuestionInstruction | QuestionText | QuestionChoice;

const WHITESPACE = /\s+/g;
const CATEGORY_NAME = /^\p{Lu}+$/u;
const QUESTION_NAME = /^Úloha (?<number>[0-9]+)$/;
const CHOICE_START = /^[abcd]\./;

const convertRunToBlock = (element: MammothRun): Block | null => {

	if (element.children.length !== 1) {
		console.error(`unexpected run length`, element);
		throw new Error(`Unexpected run length.`);
	}

	const text = element.children[0].value;

	if (text === 'Biofyzika souhrn všech otázek') {
		return null;
	}

	if (text === 'Vyberte jednu nebo více možností:') {
		return {
			type: 'question-instruction',
			text,
		};
	}

	if (element.color === 'FF0000') {
		const match = CATEGORY_NAME.exec(text);
		if (match) {
			const name = match[0].slice(0, 1) + match[0].slice(1).toLocaleLowerCase('cs-CZ');
			return {
				type: 'category-name',
				name,
			};
		}
	}

	if (element.isBold) {
		const match = QUESTION_NAME.exec(text);
		if (match) {
			const number = Number.parseInt(match.groups?.number as string);
			if (Number.isInteger(number)) {
				return {
					type: 'question-name',
					number,
				};
			}
		}
	}

	if (CHOICE_START.test(text)) {
		const name = text.slice(0, 1);
		const id = name.charCodeAt(0) - ('a'.charCodeAt(0)) + 1;
		const choice = text.slice(3);
		if (!(1 <= id && id <= 4 && choice.length > 0)) {
			console.error(`invalid question choice`, name, id, choice, text);
			throw new Error(`Invalid question choice.`);
		}
		return {
			type: 'question-choice',
			id,
			text: choice,
			correct: element.highlight === 'yellow',
		};
	}

	return {
		type: 'question-text',
		text,
	};

};

interface Category {
	id: number;
	name: string;
	numQuestions: number;
}

interface Choice {
	id: number;
	text: string;
}

interface Question {
	category: number;
	number: number;
	type: 'choice';
	text: string;
	multiple: true;
	correct: number[];
	choices: Choice[];
}

const convertBlocksToData = (blocks: Block[]): any => {

	let nextBlockType: Array<Block['type']> = ['category-name'];

	const categories: Category[] = [];
	const questions: Question[] = [];

	const numChoicesPerQuestion = 4;

	let categoryId = 0;
	let questionNumber = 0;
	let currentCategory: Category | null = null;
	let currentQuestion: Question | null = null;

	for (const block of blocks) {

		if (!nextBlockType.includes(block.type)) {
			console.error(block);
			throw new Error(`Unexpected block.`);
		}

		if (block.type === 'category-name') {
			categoryId++;
			currentCategory = {
				id: categoryId,
				name: block.name,
				numQuestions: 0,
			};
			categories.push(currentCategory);
			nextBlockType = ['question-name'];
			continue;
		}

		if (block.type === 'question-name') {
			if (currentCategory === null) {
				// should never happen
				throw new Error(`currentCategory null while processing question-name`);
			}
			questionNumber++;
			if (questionNumber !== block.number) {
				console.error(questionNumber, block);
				throw new Error(`unexpected question number`);
			}
			currentQuestion = {
				category: currentCategory.id,
				number: block.number,
				type: 'choice',
				text: '',
				multiple: true,
				correct: [],
				choices: [],
			};
			questions.push(currentQuestion);
			currentCategory.numQuestions++;
			nextBlockType = ['question-text'];
			continue;
		}

		if (block.type === 'question-text') {
			if (currentQuestion === null) {
				// should never happen
				throw new Error(`currentQuestion null while processing question-text`);
			}
			currentQuestion.text = block.text;
			nextBlockType = ['question-instruction'];
			continue;
		}

		if (block.type === 'question-instruction') {
			if (currentQuestion === null) {
				// should never happen
				throw new Error(`currentQuestion null while processing question-instruction`);
			}
			nextBlockType = ['question-choice'];
			continue;
		}

		if (block.type === 'question-choice') {
			if (currentQuestion === null) {
				// should never happen
				throw new Error(`currentQuestion null while processing question-choice`);
			}
			if (currentQuestion.choices.length + 1 !== block.id) {
				console.error(currentQuestion, block);
				throw new Error(`unexpected choice id`);
			}
			const choice: Choice = {
				id: block.id,
				text: block.text,
			};
			currentQuestion.choices.push(choice);
			if (block.correct) {
				currentQuestion.correct.push(choice.id);
			}
			if (currentQuestion.choices.length === numChoicesPerQuestion) {
				nextBlockType = ['question-name', 'category-name'];
			} else {
				nextBlockType = ['question-choice'];
			}
			continue;
		}

		// should never happen
		throw new Error(`unprocessed block`);

	}

	if (
		nextBlockType.length !== 2
		|| !nextBlockType.every(type => type === 'question-name' || type === 'category-name')
	) {
		console.error(currentQuestion);
		throw new Error(`incomplete question but no more blocks available`);
	}

	return {
		id: 6,
		version: 1,
		locale: 'cs',
		name: 'Biofyzika 2020 1. LF UK zápočtové otázky',
		description: 'Zápočtové otázky verze 2020 z předmětu Biofyzika na 1. LF UK',
		numCategories: categories.length,
		numQuestions: questions.length,
		categories,
		questions,
	};

};

const run = async (docxFile: string, outputPackageFile: string) => {

	console.log(`docxFile = ${docxFile}`);
	console.log(`outputPackageFile = ${outputPackageFile}`);

	console.log(`reading docx file...`);

	const blocks: Block[] = [];

	const extractQuestions = (doc: MammothDocument): MammothDocument => {

		visitDescendantsOfType(doc, 'text', normalizeWhitespaceMutable);

		const cleanedDoc = removeEmptyParagraphs(doc);

		visitDescendantsOfType(cleanedDoc, 'run', (element: MammothRun) => {

			const block = convertRunToBlock(element);

			if (block !== null) {
				blocks.push(block);
			}

		});

		return cleanedDoc;

	};

	const result = await mammoth.convertToHtml(
		{ path: docxFile },
		{
			styleMap: [
				// `p[style-name='Section Title'] => h1:fresh`,
				// `p[style-name='Subsection Title'] => h2:fresh`,
			],
			transformDocument: extractQuestions,
		},
	);

	console.log(`docx to html conversion finished, messages =`, result.messages);
	console.log(`extracted ${blocks.length} blocks`);
	console.log(`converting blocks to package data...`);

	const packageData = convertBlocksToData(blocks);

	console.log(packageData);

	// const html = result.value;
	// await fs.writeFile(outputHtmlFile, html);

	console.log(`finished`);

};

// process.argv[0] - path to node (Node.js interpreter)
// process.argv[1] - path to script
// process.argv[2] - docx file
// process.argv[3] - output package file
if (!isDefined(process.argv[2]) || !isDefined(process.argv[3])) {
	console.error('usage: {docxFile} {outputHtmlFile}');
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
