# Using OCR for extracting test questions from printed books

This mini-project deals with extracting test questions from printed books
using [OCR](https://en.wikipedia.org/wiki/Optical_character_recognition) (image to text)
and custom parser (text to semantic data, in this case test questions).

It uses **[Google Cloud Vision API](https://cloud.google.com/vision)** for OCR. 👀

All code is written the in **TypeScript**.

👉 See also my other project [memorio](https://github.com/pokusew/memorio) that uses the results created in
this mini-project.


## Usage


### Requirements

* [Node.js](https://nodejs.org/) >=18.x
* [Yarn](https://yarnpkg.com/) 1.x
* _optional:_ globally installed [nodemon](https://nodemon.io/) for rerunning scripts on source changes


### Set up

1. Install all dependencies with Yarn (run `yarn`).


### Running

There are 4 scripts that implements the full pipeline from a book scan in a PDF to a machine-readable data
(a collection of questions and categories, including all metadata such as numbering and correct answers).

The scripts were developed specifically for extracting the test questions from the book
_Modelové otázky z biologie k přijímacím zkouškám na 1. lékařskou fakultu Univerzity Karlovy v Praze, verze
2011_. But they can be easily adapted to other similar use-cases too.

_Note 1:_ The input PDFs are NOT published in this repository. However, the example output is and can be
found [here](./data/modelovky-biologie-1lf-2011/questions).

_Note 2:_ Instead of `nodemon`, you can use `node` directly.

_Note 3:_ If the input PDF is scanned book where each page contains an image of two real pages (an open book),
it is better to manually split the images in the middle (e.g. using this online free
service [Split two-page layout scans to create separate PDF pages](https://deftpdf.com/split-pdf-down-the-middle))
before running the OCR using `run-ocr.ts` script.


1. #### `run-ocr.ts {bucketName} {fileName} {outputPrefix}`

   Calls _Google Cloud Vision API_
   [asyncBatchAnnotate](https://cloud.google.com/vision/docs/reference/rest/v1/files/asyncBatchAnnotate)
   (see also the [official guide](https://cloud.google.com/vision/docs/pdf)).

   The PDF (image scan) `{fileName}` must be stored in
   a [GCS bucket](https://cloud.google.com/storage/docs/key-terms#buckets) `{bucketName}`. The conversion
   result is a set of JSON files (one file for each 20 pages) that are stored in `{outputPrefix}` in the same
   bucket.

   The script waits until the conversion finishes, and then it prints the output info.

   An example:
   ```bash
   nodemon -r ./register.js scripts/run-ocr.ts \
   testbook-ocr \
   test/Modelovky_Biologie_1LF_2011.pdf \
   results/Modelovky_Biologie_1LF_2011
   ```

   _The script source code can be found in [scripts/run-ocr.ts](./scripts/run-ocr.ts)._



2. #### `post-process.ts {ocrOutputDir} {pagesDir}`

   Takes the resulting JSON files from the first script and extracts the text. The input JSON files must
   in `{ocrOutputDir}` (on local filesystem). The output is placed in `{pagesDir}` (on local filesystem). The
   output is a set of `page-XXXX.txt` files that contain the text of the corresponding pages.

   An example:
   ```bash
   nodemon -r ./register.js -i 'data/' scripts/post-process.ts \
   data/modelovky-biologie-1lf-2011/ocr-output/ \
   data/modelovky-biologie-1lf-2011/pages-original/
   ```

   _The script source code can be found in [scripts/post-process.ts](./scripts/post-process.ts)._



3. #### `parse-questions.ts {pagesDir} {questionsDir}`

   This script implements a use-case-specific semantic parser that turns the raw text pages into the
   machine-readable data (questions, categories).

   It takes the output of the second script (which is in `{pagesDir}`) and creates a collection of JSON
   files (one `categories.json` and per-page `page-XXXX.json` that contains questions from the corresponding
   page).

   When the parser encounters an unexpected token, it stops and prints the detailed information (page and
   line) where the error occurred. This allows of manual correction of the OCR text output files. The parsing
   can be rerun many times (after each correction) until there are no errors and all outputs are created.

   An example:
   ```bash
   nodemon -r ./register.js -i 'data/*/questions/' scripts/parse-questions.ts \
   data/modelovky-biologie-1lf-2011/pages/ \
   data/modelovky-biologie-1lf-2011/questions/
   ```

   _The script source code can be found in [scripts/parse-questions.ts](./scripts/parse-questions.ts)._



4. #### `memorio-transform.ts {questionsDir} {memorioOutputDir}`

   Takes the parsed questions and categories from the third script (which are in `{questionsDir}`)
   and transforms them to the format that can be used in [memorio](https://github.com/pokusew/memorio) app.

   An example:
   ```bash
   nodemon -r ./register.js -i 'data/*/memorio/' scripts/memorio-transform.ts \
   data/modelovky-biologie-1lf-2011/questions/ \
   data/modelovky-biologie-1lf-2011/memorio/
   ```

   _The script source code can be found in [scripts/memorio-transform.ts](./scripts/memorio-transform.ts)._



## Useful resources


### Unicode

* [What Unicode character is this?](https://babelstone.co.uk/Unicode/whatisit.html)
* [Unicode Slide Show](https://babelstone.co.uk/Unicode/unicode.html)
* more Unicode tools: https://babelstone.co.uk/Unicode/


### Google Cloud Vision

* https://cloud.google.com/vision/docs/pdf
* https://cloud.google.com/vision/docs/fulltext-annotations

* https://cloud.google.com/docs/authentication/production

* https://cloud.google.com/vision/docs/reference/rest/v1/files/asyncBatchAnnotate

* https://cloud.google.com/vision/pricing
* https://cloud.google.com/vision/docs/languages


### OCR in Python

* https://nanonets.com/blog/ocr-with-tesseract/
* https://www.pyimagesearch.com/category/optical-character-recognition-ocr/
