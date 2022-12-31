// Note:
//   This is an extended version of the original types definition
//   from https://github.com/mwilliamson/mammoth.js/blob/master/lib/index.d.ts.

interface Mammoth {
	convertToHtml: (input: Input, options?: Options) => Promise<Result>;
	extractRawText: (input: Input) => Promise<Result>;
	embedStyleMap: (input: Input, styleMap: string) => Promise<{ toBuffer: () => Buffer }>;
	images: Images;
	transforms: Transforms;
}

type Input = NodeJsInput | BrowserInput;

type NodeJsInput = PathInput | BufferInput;

interface PathInput {
	path: string;
}

interface BufferInput {
	buffer: Buffer;
}

type BrowserInput = ArrayBufferInput;

interface ArrayBufferInput {
	arrayBuffer: ArrayBuffer;
}

interface Options {
	styleMap?: string | Array<string>;
	includeEmbeddedStyleMap?: boolean;
	includeDefaultStyleMap?: boolean;
	convertImage?: ImageConverter;
	ignoreEmptyParagraphs?: boolean;
	idPrefix?: string;
	transformDocument?: (document: MammothDocument) => MammothElement;
}

interface ImageConverter {
	__mammothBrand: "ImageConverter";
}

interface Image {
	contentType: string;
	read: ImageRead;
}

interface Transforms {
	paragraph: (element: MammothParagraph) => MammothElement;
	run: (element: MammothRun) => MammothElement;
	getDescendantsOfType: <Type extends MammothElement>(element: MammothElement, type: Type["type"]) => Array<Type>;
	getDescendants: (element: MammothElement) => Array<MammothElement>;
}

interface ImageRead {
	(): Promise<Buffer>;

	(encoding: string): Promise<string>;
}

interface ImageAttributes {
	src: string;
}

interface Images {
	dataUri: ImageConverter;
	imgElement: (f: (image: Image) => Promise<ImageAttributes>) => ImageConverter;
}

interface Result {
	value: string;
	messages: Array<Message>;
}

type Message = Warning | Error;

interface Warning {
	type: "warning";
	message: string;
}

interface Error {
	type: "error";
	message: string;
	error: unknown;
}

// TODO: improve transform related types

export type MammothElement = MammothDocument | MammothParagraph | MammothRun | MammothText | MammothBreak;

export interface MammothDocument {
	type: "document";
	children: Array<MammothParagraph>;
	notes: any;
	comments: Array<any>;
}

export interface MammothParagraph {
	type: "paragraph";
	children: Array<MammothRun>;
	styleId: string | null;
	styleName: string | null;
	numbering: string | null;
	alignment: string | "center";
	indent: {
		start: string | null;
		end: string | null;
		firstLine: string | null;
		hanging: string | null;
	};
}

export interface MammothRun {
	type: "run";
	children: Array<MammothText>;
	styleId: string | null,
	styleName: string | null,
	isBold: boolean,
	isUnderline: boolean,
	isItalic: boolean,
	isStrikethrough: boolean,
	isAllCaps: boolean,
	isSmallCaps: boolean,
	verticalAlignment: "baseline" | string,
	font: string | null;
	fontSize: number;
	color: string | null;
	highlight: string | null;
}

export interface MammothText {
	type: "text";
	value: string;
}

export interface MammothBreak {
	type: "break";
	breakType: "line" | string;
}

export const mammoth: Mammoth;

export default mammoth;
