import { TextDocument, Position } from 'vscode-languageserver-types'
import { isAbbreviationValid, extractAbbreviation, extractAbbreviationFromText, getExpandOptions, emmetSnippetField, updateExtensionsPath, doComplete, expandAbbreviation } from '../emmetHelper';
import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';

const extensionsPath = path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-profile');

describe('Validate Abbreviations', () => {
    it('should return true for valid abbreivations', () => {
        const htmlAbbreviations = ['ul>li', 'ul', 'h1', 'ul>li*3', '(ul>li)+div', '.hello', '!', '#hello', '.item[id=ok]'];
        htmlAbbreviations.forEach(abbr => {
            assert(isAbbreviationValid('html', abbr));
        });
        htmlAbbreviations.forEach(abbr => {
            assert(isAbbreviationValid('haml', abbr));
        });
    });
    it('should return false for invalid abbreivations', () => {
        const htmlAbbreviations = ['!ul!', '(hello)', 'super(hello)', 'console.log(hello)'];
        const cssAbbreviations = ['123'];
        htmlAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('html', abbr));
        });
        htmlAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('haml', abbr));
        });
        cssAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('css', abbr));
        });
        cssAbbreviations.forEach(abbr => {
            assert(!isAbbreviationValid('scss', abbr));
        });
    })
});

describe('Extract Abbreviations', () => {
    it('should extract abbreviations from document', () => {
        const testCases: [string, number, number, string, number, number, number, number, string][] = [
            ['<div>ul>li*3</div>', 0, 7, 'ul', 0, 5, 0, 7, undefined],
            ['<div>ul>li*3</div>', 0, 10, 'ul>li', 0, 5, 0, 10, undefined],
            ['<div>ul>li*3</div>', 0, 12, 'ul>li*3', 0, 5, 0, 12, undefined],
            ['ul>li', 0, 5, 'ul>li', 0, 0, 0, 5, undefined],
            ['ul>li|bem', 0, 9, 'ul>li', 0, 0, 0, 9, 'bem']
        ]

        testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedRangeStartLine, expectedRangeStartChar, expectedRangeEndLine, expectedRangeEndChar, expectedFilter]) => {
            const document = TextDocument.create('test://test/test.html', 'html', 0, content);
            const position = Position.create(positionLine, positionChar);
            const { abbreviationRange, abbreviation, filter } = extractAbbreviation(document, position);

            assert.equal(expectedAbbr, abbreviation);
            assert.equal(expectedRangeStartLine, abbreviationRange.start.line);
            assert.equal(expectedRangeStartChar, abbreviationRange.start.character);
            assert.equal(expectedRangeEndLine, abbreviationRange.end.line);
            assert.equal(expectedRangeEndChar, abbreviationRange.end.character);
            assert.equal(filter, expectedFilter);
        });
    });

    it('should extract abbreviations from text', () => {
        const testCases: [string, string, string][] = [
            ['ul', 'ul', undefined],
            ['ul>li', 'ul>li', undefined],
            ['ul>li*3', 'ul>li*3', undefined],
            ['ul>li|bem', 'ul>li', 'bem'],
            ['ul>li|t', 'ul>li', 't']
        ]

        testCases.forEach(([content, expectedAbbr, expectedFilter]) => {
            const { abbreviation, filter } = extractAbbreviationFromText(content);

            assert.equal(expectedAbbr, abbreviation);
            assert.equal(filter, expectedFilter);

        });
    });
});

describe('Test Basic Expand Options', () => {
    it('should check for basic expand options', () => {
        const syntax = 'anythingreally';
        let expandOptions = getExpandOptions(syntax);

        assert.equal(expandOptions.field, emmetSnippetField)
        assert.equal(expandOptions.syntax, syntax);
        assert.equal(Object.keys(expandOptions.addons).length, 0);
    });
});

describe('Test addons in Expand Options', () => {
    it('should add jsx as addon for jsx syntax', () => {
        const syntax = 'jsx';
        let expandOptions = getExpandOptions(syntax);

        assert.equal(Object.keys(expandOptions.addons).length, 1);
        assert.equal(expandOptions.addons['jsx'], true);
    });

    it('should add bem as addon when bem filter is provided', () => {
        const syntax = 'anythingreally';
        let expandOptions = getExpandOptions(syntax, {}, 'bem');

        assert.equal(Object.keys(expandOptions.addons).length, 1);
        assert.equal(expandOptions.addons['bem']['element'], '__');
    });

    it('should add bem before jsx as addon when bem filter is provided', () => {
        const syntax = 'jsx';
        let expandOptions = getExpandOptions(syntax, {}, 'bem');

        assert.equal(Object.keys(expandOptions.addons).length, 2);
        assert.equal(Object.keys(expandOptions.addons)[0], 'bem');
        assert.equal(Object.keys(expandOptions.addons)[1], 'jsx');
        assert.equal(expandOptions.addons['bem']['element'], '__');
        assert.equal(expandOptions.addons['jsx'], true);
    });
});

describe('Test output profile settings', () => {
    it('should convert output profile from old format to new', () => {
        const profile = {
            tag_case: 'lower',
            attr_case: 'lower',
            attr_quotes: 'single',
            tag_nl: true,
            inline_break: 2,
            self_closing_tag: 'xhtml'
        }

        const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });

        assert.equal(profile['tag_case'], expandOptions.profile['tagCase']);
        assert.equal(profile['attr_case'], expandOptions.profile['attributeCase']);
        assert.equal(profile['attr_quotes'], expandOptions.profile['attributeQuotes']);
        assert.equal(profile['tag_nl'], expandOptions.profile['format']);
        assert.equal(profile['inline_break'], expandOptions.profile['inlineBreak']);
        assert.equal(profile['self_closing_tag'], expandOptions.profile['selfClosingStyle']);
    });

    it('should convert self_closing_style', () => {
        const testCases = [true, false, 'xhtml'];
        const expectedValue = ['xml', 'html', 'xhtml'];

        for (let i = 0; i < testCases.length; i++) {
            const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { self_closing_tag: testCases[i] } } });
            assert.equal(expandOptions.profile['selfClosingStyle'], expectedValue[i]);
        }
    });

    it('should convert tag_nl', () => {
        const testCases = [true, false, 'decide'];
        const expectedValue = [true, false, true];

        for (let i = 0; i < testCases.length; i++) {
            const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: { tag_nl: testCases[i] } } });
            assert.equal(expandOptions.profile['format'], expectedValue[i]);
        }
    });

    it('shoud use output profile in new format as is', () => {
        const profile = {
            tagCase: 'lower',
            attributeCase: 'lower',
            attributeQuotes: 'single',
            format: true,
            inlineBreak: 2,
            selfClosingStyle: 'xhtml'
        };

        const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });
        Object.keys(profile).forEach(key => {
            assert.equal(expandOptions.profile[key], profile[key]);
        });
    });

    it('should use profile from settings that overrides the ones from extensionsPath', () => {
        return updateExtensionsPath(extensionsPath).then(() => {
            const profile = {
                tag_case: 'lower',
                attr_case: 'lower',
                attr_quotes: 'single',
                tag_nl: true,
                inline_break: 2,
                self_closing_tag: 'xhtml'
            }

            const expandOptions = getExpandOptions('html', { syntaxProfiles: { html: profile } });
            assert.equal(expandOptions.profile['tagCase'], 'lower');
            assert.equal(profile['tag_case'], 'lower');
            return Promise.resolve();
        });
    });
});

describe('Test variables settings', () => {
    it('should take in variables as is', () => {
        const variables = {
            lang: 'de',
            charset: 'UTF-8'
        }

        const expandOptions = getExpandOptions('html', { variables });
        Object.keys(variables).forEach(key => {
            assert.equal(expandOptions.variables[key], variables[key]);
        });
    });

    it('should use variables from extensionsPath', () => {
        updateExtensionsPath(extensionsPath).then(() => {
            const expandOptions = getExpandOptions('html', {});
            assert.equal(expandOptions.variables['lang'], 'fr');
        });
    });

    it('should use given variables that override ones from extensionsPath', () => {
        updateExtensionsPath(extensionsPath).then(() => {
            const variables = {
                lang: 'en',
                charset: 'UTF-8'
            }

            const expandOptions = getExpandOptions('html', { variables });
            assert.equal(expandOptions.variables['lang'], variables['lang']);
        });
    });
});

describe('Test custom snippets', () => {
    it('should use custom snippets for given syntax from extensionsPath', () => {
        const customSnippetKey = 'ch';
        return updateExtensionsPath(null).then(() => {
            const expandOptionsWithoutCustomSnippets = getExpandOptions('css');
            assert(!expandOptionsWithoutCustomSnippets.snippets);

            // Use custom snippets from extensionsPath
            return updateExtensionsPath(extensionsPath).then(() => {
                let foundCustomSnippet = false;
                const expandOptionsWithCustomSnippets = getExpandOptions('css');
                expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });
                assert.equal(foundCustomSnippet, true);
                return Promise.resolve();
            });
        });
    });

    it('should use custom snippets inherited from base syntax from extensionsPath', () => {
        const customSnippetKey = 'ch';

        return updateExtensionsPath(null).then(() => {
            const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
            assert(!expandOptionsWithoutCustomSnippets.snippets);

            // Use custom snippets from extensionsPath
            return updateExtensionsPath(extensionsPath).then(() => {
                let foundCustomSnippet = false;
                let foundCustomSnippetInInhertitedSyntax = false;

                const expandOptionsWithCustomSnippets = getExpandOptions('css');
                const expandOptionsWithCustomSnippetsInhertedSytnax = getExpandOptions('scss');

                expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });

                expandOptionsWithCustomSnippetsInhertedSytnax.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippetInInhertitedSyntax = true;
                    }
                });

                assert.equal(foundCustomSnippet, true);
                assert.equal(foundCustomSnippetInInhertitedSyntax, true);

                return Promise.resolve();
            });
        });
    });

    it('should use custom snippets for given syntax in the absence of base syntax from extensionsPath', () => {
        const customSnippetKey = 'ch';
        return updateExtensionsPath(null).then(() => {
            const expandOptionsWithoutCustomSnippets = getExpandOptions('scss');
            assert(!expandOptionsWithoutCustomSnippets.snippets);

            // Use custom snippets from extensionsPath
            return updateExtensionsPath(path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-without-inheritence')).then(() => {
                let foundCustomSnippet = false;
                const expandOptionsWithCustomSnippets = getExpandOptions('scss');
                expandOptionsWithCustomSnippets.snippets.all({ type: 'string' }).forEach(snippet => {
                    if (snippet.key === customSnippetKey) {
                        foundCustomSnippet = true;
                    }
                });
                assert.equal(foundCustomSnippet, true);
                return Promise.resolve();
            });
        });
    });

    it('should throw error when snippets file from extensionsPath has invalid json', () => {
        // Use invalid snippets.json
        return updateExtensionsPath(path.join(path.normalize(path.join(__dirname, '../..')), 'testData', 'custom-snippets-invalid-json')).then(() => {
            assert.ok(false, 'updateExtensionsPath method should have failed for invalid json but it didnt');
            return Promise.resolve();
        }, (e) => {
            assert.ok(e);
            return Promise.resolve();
        });
    });

    it('should reset custom snippets when no extensionsPath is given', () => {
        const customSnippetKey = 'ch';
        return updateExtensionsPath(extensionsPath).then(() => {
            let foundCustomSnippet = false;
            getExpandOptions('scss').snippets.all({ type: 'string' }).forEach(snippet => {
                if (snippet.key === customSnippetKey) {
                    foundCustomSnippet = true;
                }
            });
            assert.equal(foundCustomSnippet, true);

            // Use invalid snippets.json
            return updateExtensionsPath(null).then(() => {
                assert.ok(!getExpandOptions('scss').snippets, 'There should be no custom snippets as extensionPath was not given');
                return Promise.resolve();
            }, (e) => {
                assert.ok(!e, 'When extensionsPath is not given, there shouldnt be any error.');
            });
        });
    });
});

describe('Test emmet preferences', () => {
    it('should use stylesheet preferences', () => {
        assert.equal(expandAbbreviation('m10', getExpandOptions('css', { preferences: { 'css.propertyEnd': ';;' } })), 'margin: 10px;;');
        assert.equal(expandAbbreviation('m10', getExpandOptions('scss', { preferences: { 'scss.valueSeparator': '::' } })), 'margin::10px;');
        assert.equal(expandAbbreviation('m10', getExpandOptions('less', { preferences: { 'css.intUnit': 'pt' } })), 'margin: 10pt;');
        assert.equal(expandAbbreviation('m10.2', getExpandOptions('css', { preferences: { 'css.floatUnit': 'ex' } })), 'margin: 10.2ex;');
        assert.equal(expandAbbreviation('m10r', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10 /rem;');
        assert.equal(expandAbbreviation('m10p', getExpandOptions('css', { preferences: { 'css.unitAliases': 'e:em, p:%,r: /rem' } })), 'margin: 10%;');
    });
});

describe('Test completions', () => {
    it('should provide completions', () => {
        return updateExtensionsPath(null).then(() => {
            const bemFilterExample = 'ul.search-form._wide>li.-querystring+li.-btn_large|bem';
            const expectedBemFilterOutput =
                `<ul class="search-form search-form_wide">
	<li class="search-form__querystring">|</li>
	<li class="search-form__btn search-form__btn_large">|</li>
</ul>`;
            const commentFilterExample = 'ul.nav>li#item|c';
            const expectedCommentFilterOutput =
                `<ul class="nav">
	<li id="item">|</li>
	<!-- /#item -->
</ul>
<!-- /.nav -->`;

            const testCases: [string, number, number, string, string][] = [
                ['<div>ul>li*3</div>', 0, 7, 'ul', '<ul>|</ul>'], // One of the commonly used tags
                ['<div>UL</div>', 0, 7, 'UL', '<UL>|</UL>'], // One of the commonly used tags with upper case
                ['<div>ul>li*3</div>', 0, 10, 'ul>li', '<ul>\n\t<li>|</li>\n</ul>'], // Valid abbreviation
                ['<div>(ul>li)*3</div>', 0, 14, '(ul>li)*3', '<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>\n<ul>\n\t<li>|</li>\n</ul>'], //Valid abbreviation with grouping
                ['<div>custom-tag</div>', 0, 15, 'custom-tag', '<custom-tag>|</custom-tag>'], // custom tag with -
                ['<div>custom:tag</div>', 0, 15, 'custom:tag', '<custom:tag>|</custom:tag>'], // custom tag with -
                ['<div>sp</div>', 0, 7, 'span', '<span>|</span>'], // Prefix of a common tag
                ['<div>SP</div>', 0, 7, 'SPan', '<SPan>|</SPan>'], // Prefix of a common tag in upper case
                ['<div>u:l:l</div>', 0, 10, 'u:l:l', '<u:l:l>|</u:l:l>'], // Word with : is valid
                ['<div>u-l-z</div>', 0, 10, 'u-l-z', '<u-l-z>|</u-l-z>'], // Word with - is valid
                [bemFilterExample, 0, bemFilterExample.length, bemFilterExample, expectedBemFilterOutput],
                [commentFilterExample, 0, commentFilterExample.length, commentFilterExample, expectedCommentFilterOutput]
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items[0].label, expectedAbbr);
                assert.equal(completionList.items[0].documentation, expectedExpansion);
            });
            return Promise.resolve();

        });
    });

    it('should provide completions for text that are prefix for snippets, ensure $ doesnt get escaped', () => {
        return updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number][] = [
                ['<div> l </div>', 0, 7]
            ];

            testCases.forEach(([content, positionLine, positionChar]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: true,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items.find(x => x.label === 'link').documentation, '<link rel="stylesheet" href="|">');
                assert.equal(completionList.items.find(x => x.label === 'link').textEdit.newText, '<link rel="stylesheet" href="${1}">');
                assert.equal(completionList.items.find(x => x.label === 'link:css').documentation, '<link rel="stylesheet" href="style.css">');
                assert.equal(completionList.items.find(x => x.label === 'link:css').textEdit.newText, '<link rel="stylesheet" href="${2:style}.css">');

            });
            return Promise.resolve();

        });
    });

    it('should provide completions with escaped $', () => {
        return updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number][] = [
                ['bim$hello', 0, 9]
            ];

            testCases.forEach(([content, positionLine, positionChar]) => {
                const document = TextDocument.create('test://test/test.scss', 'scss', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'scss', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items.find(x => x.label === 'background-image: $hello;').documentation, 'background-image: $hello;');
                assert.equal(completionList.items.find(x => x.label === 'background-image: $hello;').textEdit.newText, 'background-image: \\$hello;');

            });
            return Promise.resolve();

        });
    });

    it('should provide completions using custom snippets html', () => {
        return updateExtensionsPath(extensionsPath).then(() => {
            const testCases: [string, number, number, string, string][] = [
                ['<div>hey</div>', 0, 8, 'hey', '<ul>\n\t<li><span class="hello">|</span></li>\n\t<li><span class="hello">|</span></li>\n</ul>']
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {
                        'html': {
                            'tag_case': 'lower'
                        }
                    },
                    variables: {}
                });

                assert.equal(completionList.items[0].label, expectedAbbr);
                assert.equal(completionList.items[0].documentation, expectedExpansion);
            });
            return Promise.resolve();

        });
    });

    it('should provide completions using custom snippets css', () => {
        return updateExtensionsPath(extensionsPath).then(() => {
            const testCases: [string, number, number, string, string][] = [
                ['hel', 0, 3, 'hello', 'margin: 10px;'],
                ['hello', 0, 5, 'hello', 'margin: 10px;']
            ];

            testCases.forEach(([content, positionLine, positionChar, expectedAbbr, expectedExpansion]) => {
                const document = TextDocument.create('test://test/test.css', 'css', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'css', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items[0].label, expectedAbbr);
                assert.equal(completionList.items[0].documentation, expectedExpansion);
            });
            return Promise.resolve();

        });
    });

    it('should not provide completions as they would noise when typing', () => {
        return updateExtensionsPath(null).then(() => {
            const testCases: [string, number, number][] = [
                ['<div>abc</div>', 0, 8], // Simple word
                ['<div>Abc</div>', 0, 8], // Simple word with mixed casing
                ['<div>abc12</div>', 0, 10], // Simple word with numbers
                ['<div>abc.</div>', 0, 9], // Word ending with period
                ['<div>(div)</div>', 0, 10], // Word inside brackets
                ['<div>ul::l</div>', 0, 10] // Word with : is valid, but not consecutive
            ];

            testCases.forEach(([content, positionLine, positionChar]) => {
                const document = TextDocument.create('test://test/test.html', 'html', 0, content);
                const position = Position.create(positionLine, positionChar);
                const completionList = doComplete(document, position, 'html', {
                    preferences: {},
                    showExpandedAbbreviation: 'always',
                    showAbbreviationSuggestions: false,
                    syntaxProfiles: {},
                    variables: {}
                });

                assert.equal(completionList.items.length, 0);
            });
            return Promise.resolve();

        });
    });

    it('should provide completions for lorem', () => {
        return updateExtensionsPath(null).then(() => {


            const document = TextDocument.create('test://test/test.html', 'html', 0, 'lorem10.item');
            const position = Position.create(0, 12);
            const completionList = doComplete(document, position, 'html', {
                preferences: {},
                showExpandedAbbreviation: 'always',
                showAbbreviationSuggestions: false,
                syntaxProfiles: {},
                variables: {}
            });
            const expandedText = completionList.items[0].documentation;
            let matches = expandedText.match(/<div class="item">(.*)<\/div>/);

            assert.equal(completionList.items[0].label, 'lorem10.item');
            assert.equal(matches != null, true);
            assert.equal(matches[1].split(' ').length, 10);
            assert.equal(matches[1].startsWith('Lorem'), true);

            return Promise.resolve();

        });
    });

})