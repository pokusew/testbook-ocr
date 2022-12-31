"use strict";

import path from 'path';
import fs from 'fs/promises';

import util from 'util';
import { isDefined } from './common';

import mammoth, { MammothDocument, MammothElement, MammothParagraph, MammothRun, MammothText } from 'mammoth';


util.inspect.defaultOptions.depth = Infinity;


const visitDescendants = (element: MammothElement, visit: (element: MammothElement) => void) => {
	if (element.type === 'text' || element.type === 'break') {
		return;
	}
	if (!isDefined(element.children)) {
		console.warn(`unknown element type ${element.type} does not have children property`, element);
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

interface SuperParagraph {
	text: string;
	texts: Array<string>;
	anyIsBold: boolean;
	colors: Set<string>;
	highlights: Set<string>;
}

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
	instruction: 'single-choice' | 'multiple-choice';
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
const CATEGORY_NAME = /^[\p{Lu}\s]+$/u;
const QUESTION_NAME = /^Úloha (?<number>[0-9]+)$/;
const CHOICE_START = /^[abcde]\./;

const convertSuperParagraphToBlock = (sp: SuperParagraph): Block | null => {

	const text = sp.text;

	if (text === 'Biofyzika souhrn všech otázek') {
		return null;
	}

	if (text === 'Vyberte jednu nebo více možností:') {
		return {
			type: 'question-instruction',
			instruction: 'multiple-choice',
		};
	}

	if (text === 'Vyberte jednu z nabízených možností:') {
		return {
			type: 'question-instruction',
			instruction: 'single-choice',
		};
	}

	if (sp.colors.has('FF0000') || !sp.colors.has('333333')) {
		const match = CATEGORY_NAME.exec(text);
		if (match) {
			const name = match[0].slice(0, 1) + match[0].slice(1).toLocaleLowerCase('cs-CZ');
			if (!sp.colors.has('FF0000')) {
				console.warn(`category ${name} with an unexpected color`, sp.colors);
			}
			return {
				type: 'category-name',
				name,
			};
		}
	}

	// for some reason not all question names have sp.anyIsBold === true
	// it seems that isBold flag is not always correctly set by mammoth
	// (at least in the questions from the second category and further)
	const questionNameMatch = QUESTION_NAME.exec(text);
	if (questionNameMatch) {
		const number = Number.parseInt(questionNameMatch.groups?.number as string);
		if (Number.isInteger(number)) {
			return {
				type: 'question-name',
				number,
			};
		}
	}

	if (CHOICE_START.test(text)) {
		const name = text.slice(0, 1);
		const id = name.charCodeAt(0) - ('a'.charCodeAt(0)) + 1;
		const choice = text.slice(3);
		//  && choice.length > 0
		if (!(1 <= id && id <= 5)) {
			console.error(`invalid question choice`, name, id, choice, text);
			throw new Error(`Invalid question choice.`);
		}
		return {
			type: 'question-choice',
			id,
			text: choice,
			correct: sp.highlights.has('yellow'),
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
	number: number;
	numQuestions: number;
}

interface Choice {
	id: number;
	text: string;
}

interface Question {
	id: number;
	category: number;
	number: number;
	type: 'choice';
	text: string;
	multiple: boolean;
	correct: number[];
	choices: Choice[];
}

interface Package {
	id: number;
	version: number;
	locale: string;
	name: string;
	description: string;
	numCategories: number;
	numQuestions: number;
	categories: Category[];
	questions: Question[];
}

const convertBlocksToData = (blocks: Block[]): Package => {

	let nextBlockType: Array<Block['type']> = ['category-name'];

	const categories: Category[] = [];
	const questions: Question[] = [];

	const defaultNumChoicesPerQuestion = 4;
	const numChoicesPerQuestion = new Map<number, number>([
		// [question.number, numChoices]
		[96, 5],
		[97, 5],
		[143, 3],
		[200, 5],
		[201, 5],
		[202, 5],
		[360, 3],
		[524, 5],
		[525, 5],
		[579, 3],
		[580, 3],
		[737, 5],
		[754, 2],
		[755, 3],
		[768, 3],
		[769, 3],
		[770, 3],
		[771, 3],
		[772, 3],
		[1194, 5],
		[1302, 5],
		[1303, 5],
	]);
	const getNumChoicesPerQuestion = (id: number) =>
		numChoicesPerQuestion.get(id) ?? defaultNumChoicesPerQuestion;

	let categoryId = 0;
	let questionId = 0;
	let currentCategory: Category | null = null;
	let currentQuestion: Question | null = null;
	let currentChoice: Choice | null = null;

	for (const block of blocks) {

		// if (block.type === 'question-text' && currentChoice !== null) {
		// 	// console.warn('appending question-text to the last choice', block, currentQuestion);
		// 	currentChoice.text += ' ' + block.text;
		// 	continue;
		// }

		if (!nextBlockType.includes(block.type)) {
			console.error('nextBlockType =', nextBlockType);
			console.error('block =', block);
			console.error('currentCategory =', currentCategory);
			console.error('currentQuestion =', currentQuestion);
			throw new Error(`Unexpected block.`);
		}

		if (block.type === 'category-name') {
			categoryId++;
			currentCategory = {
				id: categoryId,
				name: block.name,
				number: categoryId,
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
			questionId++;
			if (currentCategory.numQuestions + 1 !== block.number) {
				console.error(questionId, block);
				throw new Error(`unexpected question number`);
			}
			currentQuestion = {
				id: questionId,
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
			currentChoice = null;
			continue;
		}

		if (block.type === 'question-text') {
			if (currentQuestion === null) {
				// should never happen
				throw new Error(`currentQuestion null while processing question-text`);
			}
			if (currentQuestion.text.length > 0) {
				currentQuestion.text += ' ';
			}
			currentQuestion.text += block.text;
			nextBlockType = ['question-instruction'];
			continue;
		}

		if (block.type === 'question-instruction') {
			if (currentQuestion === null) {
				// should never happen
				throw new Error(`currentQuestion null while processing question-instruction`);
			}
			if (block.instruction === 'multiple-choice') {
				currentQuestion.multiple = true;
			} else if (block.instruction === 'single-choice') {
				currentQuestion.multiple = false;
			} else {
				console.error(`unsupported question-instruction`, block, currentQuestion);
				throw new Error(`unsupported question-instruction`);
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
			currentChoice = {
				id: block.id,
				text: block.text,
			};
			currentQuestion.choices.push(currentChoice);
			if (block.correct) {
				currentQuestion.correct.push(currentChoice.id);
			}
			if (currentQuestion.choices.length === getNumChoicesPerQuestion(currentQuestion.id)) {
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

const toSuperParagraph = (element: MammothParagraph): SuperParagraph => {

	const texts: string[] = [];
	let anyIsBold = false;
	const colors = new Set<string>();
	const highlights = new Set<string>();

	visitDescendantsOfType<MammothRun>(element, 'run', (run => {

		run.children.forEach(text => texts.push(text.value));

		if (run.isBold) {
			anyIsBold = true;
		}

		if (run.color !== null) {
			colors.add(run.color);
		}

		if (run.highlight !== null) {
			highlights.add(run.highlight);
		}

	}));

	const text = texts.join('').replace(WHITESPACE, ' ').trim();

	return {
		text,
		texts,
		anyIsBold,
		colors,
		highlights,
	};

};

const run = async (docxFile: string, outputPackageFile: string) => {

	console.log(`docxFile = ${docxFile}`);
	console.log(`outputPackageFile = ${outputPackageFile}`);

	console.log(`reading docx file...`);

	const blocks: Block[] = [];

	const extractQuestions = (doc: MammothDocument): MammothDocument => {

		const superParagraphs = doc.children
			.map(toSuperParagraph)
			.filter(sp => sp.text !== '');

		// console.log(superParagraphs);

		superParagraphs.forEach(sp => {

			const block = convertSuperParagraphToBlock(sp);

			if (block !== null) {
				blocks.push(block);
			}

		});

		// no need to actually convert anything to HTML as we extracted the data from the document's AST
		return {
			...doc,
			children: [],
		};

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

	const tmpBlocksData = `${__dirname}/../temp/blocks.json`;
	console.log(`writing blocks data to ${tmpBlocksData}`);
	await fs.writeFile(tmpBlocksData, JSON.stringify(blocks, undefined, '\t'));

	console.log(`converting blocks to package data...`);

	const packageData = convertBlocksToData(blocks);

	console.log(`conversion of blocks to package data finished:`);
	console.log(`  numCategories =`, packageData.numCategories);
	console.log(`  numQuestions =`, packageData.numQuestions);
	console.log(`  categories:`);
	packageData.categories.forEach(category => {
		console.log(`    ${category.id}. ${category.name} (${category.numQuestions})`);
	});

	console.log(`writing package data to ${outputPackageFile}`);
	await fs.writeFile(outputPackageFile, JSON.stringify(packageData, undefined, '\t'));

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
