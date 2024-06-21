// Figure out what needs to happen here
// https://microsoft.github.io/monaco-editor/playground.html?source=v0.49.0#example-customizing-the-appearence-tokens-and-colors
const anysphere = {
	inherit: true,
	base: 'vs-dark',
	colors: {
		'activityBar.activeBackground': '#181818',
		'activityBar.background': '#181818',
		'activityBar.border': '#383838',
		'activityBar.foreground': '#e3e1e3',
		'activityBar.inactiveForeground': '#7a797a',
		'activityBarBadge.background': '#228df2',
		'activityBarBadge.foreground': '#d6d6dd',
		'badge.background': '#228df2',
		'badge.foreground': '#d6d6dd',
		'breadcrumb.activeSelectionForeground': '#d6d6dd',
		'breadcrumb.background': '#181818',
		'breadcrumb.focusForeground': '#d6d6dd',
		'breadcrumb.foreground': '#a6a6a6',
		'button.background': '#228df2',
		'button.foreground': '#e6e6ed',
		'button.hoverBackground': '#359dff',
		'button.secondaryBackground': '#1d1d1d',
		'button.secondaryForeground': '#d6d6dd',
		'button.secondaryHoverBackground': '#303030',
		'checkbox.background': '#1d1d1d',
		'checkbox.border': '#4f4f4f',
		'checkbox.foreground': '#d6d6dd',
		'commandCenter.activeBackground': '#1d1d1d',
		'commandCenter.background': '#292929',
		'commandCenter.foreground': '#c1c1c1',
		'debugExceptionWidget.background': '#1d1d1d',
		'debugExceptionWidget.border': '#383838',
		'debugToolBar.background': '#343334',
		'debugToolBar.border': '#383838',
		'diffEditor.border': '#383838',
		'diffEditor.insertedTextBackground': '#83d6c530',
		'diffEditor.insertedTextBorder': '#d6d6dd00',
		'diffEditor.removedTextBackground': '#f14c4c30',
		'diffEditor.removedTextBorder': '#d6d6dd00',
		'dropdown.background': '#1d1d1d',
		'dropdown.border': '#383838',
		'dropdown.foreground': '#d6d6dd',
		'editor.background': '#181818',
		'editor.findMatchBackground': '#163764',
		'editor.findMatchBorder': '#00000000',
		'editor.findMatchHighlightBackground': '#7c511a',
		'editor.findMatchHighlightBorder': '#d7d7dd02',
		'editor.findRangeHighlightBackground': '#1d1d1d',
		'editor.findRangeHighlightBorder': '#d6d6dd00',
		'editor.foldBackground': '#1d1d1d',
		'editor.foreground': '#d6d6dd',
		'editor.hoverHighlightBackground': '#5b51ec70',
		'editor.inactiveSelectionBackground': '#363636',
		'editor.lineHighlightBackground': '#292929',
		'editor.lineHighlightBorder': '#d6d6dd00',
		'editor.rangeHighlightBackground': '#1d1d1d',
		'editor.rangeHighlightBorder': '#38383800',
		'editor.selectionBackground': '#163761',
		'editor.selectionHighlightBackground': '#16376170',
		'editor.selectionHighlightBorder': '#d6d6dd00',
		'editor.wordHighlightBackground': '#ff000000',
		'editor.wordHighlightBorder': '#d6d6dd00',
		'editor.wordHighlightStrongBackground': '#16376170',
		'editor.wordHighlightStrongBorder': '#d6d6dd00',
		'editorBracketMatch.background': '#163761',
		'editorBracketMatch.border': '#d6d6dd00',
		'editorCodeLens.foreground': '#d6d6dd',
		'editorCursor.background': '#181818',
		'editorCursor.foreground': '#d6d6dd',
		'editorError.background': '#b73a3400',
		'editorError.border': '#d6d6dd00',
		'editorError.foreground': '#f14c4c',
		'editorGroup.border': '#383838',
		'editorGroup.emptyBackground': '#181818',
		'editorGroupHeader.border': '#d6d6dd00',
		'editorGroupHeader.tabsBackground': '#292929',
		'editorGroupHeader.tabsBorder': '#d6d6dd00',
		'editorGutter.addedBackground': '#15ac91',
		'editorGutter.background': '#181818',
		'editorGutter.commentRangeForeground': '#d6d6dd',
		'editorGutter.deletedBackground': '#f14c4c',
		'editorGutter.foldingControlForeground': '#d6d6dd',
		'editorGutter.modifiedBackground': '#e5b95c',
		'editorHoverWidget.background': '#1d1d1d',
		'editorHoverWidget.border': '#383838',
		'editorHoverWidget.foreground': '#d6d6dd',
		'editorIndentGuide.activeBackground': '#737377',
		'editorIndentGuide.background': '#383838',
		'editorInfo.background': '#d6d6dd00',
		'editorInfo.border': '#d6d6dd00',
		'editorInfo.foreground': '#228df2',
		'editorInlayHint.background': '#2b2b2b',
		'editorInlayHint.foreground': '#838383',
		'editorLineNumber.activeForeground': '#c2c2c2',
		'editorLineNumber.foreground': '#535353',
		'editorLink.activeForeground': '#228df2',
		'editorMarkerNavigation.background': '#2d2d30',
		'editorMarkerNavigationError.background': '#f14c4c',
		'editorMarkerNavigationInfo.background': '#4c9df3',
		'editorMarkerNavigationWarning.background': '#e5b95c',
		'editorOverviewRuler.background': '#25252500',
		'editorOverviewRuler.border': '#7f7f7f4d',
		'editorRuler.foreground': '#383838',
		'editorSuggestWidget.background': '#1d1d1d',
		'editorSuggestWidget.border': '#383838',
		'editorSuggestWidget.foreground': '#d6d6dd',
		'editorSuggestWidget.highlightForeground': '#d6d6dd',
		'editorSuggestWidget.selectedBackground': '#163761',
		'editorWarning.background': '#a9904000',
		'editorWarning.border': '#d6d6dd00',
		'editorWarning.foreground': '#ea7620',
		'editorWhitespace.foreground': '#737373',
		'editorWidget.background': '#292929',
		'editorWidget.foreground': '#d6d6dd',
		'editorWidget.resizeBorder': '#ea7620',
		focusBorder: '#d6d6dd00',
		foreground: '#d6d6dd',
		'gitDecoration.addedResourceForeground': '#5a964d',
		'gitDecoration.conflictingResourceForeground': '#aaa0fa',
		'gitDecoration.deletedResourceForeground': '#f14c4c',
		'gitDecoration.ignoredResourceForeground': '#666666',
		'gitDecoration.modifiedResourceForeground': '#1981ef',
		'gitDecoration.stageDeletedResourceForeground': '#f14c4c',
		'gitDecoration.stageModifiedResourceForeground': '#1981ef',
		'gitDecoration.submoduleResourceForeground': '#1981ef',
		'gitDecoration.untrackedResourceForeground': '#3ea17f',
		'icon.foreground': '#d6d6dd',
		'input.background': '#212121',
		'input.border': '#ffffff1e',
		'input.foreground': '#d6d6dd',
		'input.placeholderForeground': '#7b7b7b',
		'inputOption.activeBackground': '#de3c72',
		'inputOption.activeBorder': '#d6d6dd00',
		'inputOption.activeForeground': '#d6d6dd',
		'list.activeSelectionBackground': '#163761',
		'list.activeSelectionForeground': '#d6d6dd',
		'list.dropBackground': '#d6d6dd00',
		'list.focusBackground': '#5b51ec',
		'list.focusForeground': '#d6d6dd',
		'list.highlightForeground': '#d6d6dd',
		'list.hoverBackground': '#2a282a',
		'list.hoverForeground': '#d6d6dd',
		'list.inactiveSelectionBackground': '#3c3b3c',
		'list.inactiveSelectionForeground': '#d6d6dd',
		'listFilterWidget.background': '#5b51ec',
		'listFilterWidget.noMatchesOutline': '#f14c4c',
		'listFilterWidget.outline': '#00000000',
		'menu.background': '#292929',
		'menu.border': '#000000',
		'menu.foreground': '#d6d6dd',
		'menu.selectionBackground': '#194176',
		'menu.selectionBorder': '#00000000',
		'menu.selectionForeground': '#d6d6dd',
		'menu.separatorBackground': '#3e3e3e',
		'menubar.selectionBackground': '#d6d6dd20',
		'menubar.selectionBorder': '#d6d6dd00',
		'menubar.selectionForeground': '#d6d6dd',
		'merge.commonContentBackground': '#1d1d1d',
		'merge.commonHeaderBackground': '#323232',
		'merge.currentContentBackground': '#1a493d',
		'merge.currentHeaderBackground': '#83d6c595',
		'merge.incomingContentBackground': '#28384b',
		'merge.incomingHeaderBackground': '#395f8f',
		'minimap.background': '#181818',
		'minimap.errorHighlight': '#f14c4c',
		'minimap.findMatchHighlight': '#15ac9170',
		'minimap.selectionHighlight': '#363636',
		'minimap.warningHighlight': '#ea7620',
		'minimapGutter.addedBackground': '#15ac91',
		'minimapGutter.deletedBackground': '#f14c4c',
		'minimapGutter.modifiedBackground': '#e5b95c',
		'notebook.focusedCellBorder': '#15ac91',
		'notebook.focusedEditorBorder': '#15ac9177',
		'notificationCenter.border': '#2c2c2c',
		'notificationCenterHeader.background': '#2c2c2c',
		'notificationCenterHeader.foreground': '#d6d6dd',
		'notificationToast.border': '#383838',
		'notifications.background': '#1d1d1d',
		'notifications.border': '#2c2c2c',
		'notifications.foreground': '#d6d6dd',
		'notificationsErrorIcon.foreground': '#f14c4c',
		'notificationsInfoIcon.foreground': '#228df2',
		'notificationsWarningIcon.foreground': '#ea7620',
		'panel.background': '#292929',
		'panel.border': '#181818',
		'panelSection.border': '#383838',
		'panelTitle.activeBorder': '#d6d6dd',
		'panelTitle.activeForeground': '#d6d6dd',
		'panelTitle.inactiveForeground': '#d6d6dd',
		'peekView.border': '#383838',
		'peekViewEditor.background': '#001f33',
		'peekViewEditor.matchHighlightBackground': '#ea762070',
		'peekViewEditor.matchHighlightBorder': '#d6d6dd00',
		'peekViewEditorGutter.background': '#001f33',
		'peekViewResult.background': '#1d1d1d',
		'peekViewResult.fileForeground': '#d6d6dd',
		'peekViewResult.lineForeground': '#d6d6dd',
		'peekViewResult.matchHighlightBackground': '#ea762070',
		'peekViewResult.selectionBackground': '#363636',
		'peekViewResult.selectionForeground': '#d6d6dd',
		'peekViewTitle.background': '#1d1d1d',
		'peekViewTitleDescription.foreground': '#d6d6dd',
		'peekViewTitleLabel.foreground': '#d6d6dd',
		'pickerGroup.border': '#383838',
		'pickerGroup.foreground': '#d6d6dd',
		'progressBar.background': '#15ac91',
		'scrollbar.shadow': '#d6d6dd00',
		'scrollbarSlider.activeBackground': '#676767',
		'scrollbarSlider.background': '#67676750',
		'scrollbarSlider.hoverBackground': '#676767',
		'selection.background': '#163761',
		'settings.focusedRowBackground': '#d6d6dd07',
		'settings.headerForeground': '#d6d6dd',
		'sideBar.background': '#181818',
		'sideBar.border': '#383838',
		'sideBar.dropBackground': '#d6d6dd00',
		'sideBar.foreground': '#d1d1d1',
		'sideBarSectionHeader.background': '#18181800',
		'sideBarSectionHeader.border': '#d1d1d100',
		'sideBarSectionHeader.foreground': '#d1d1d1',
		'sideBarTitle.foreground': '#d1d1d1',
		'statusBar.background': '#181818',
		'statusBar.border': '#383838',
		'statusBar.debuggingBackground': '#ea7620',
		'statusBar.debuggingBorder': '#d6d6dd00',
		'statusBar.debuggingForeground': '#e7e7e7',
		'statusBar.foreground': '#d6d6dd',
		'statusBar.noFolderBackground': '#181818',
		'statusBar.noFolderBorder': '#d6d6dd00',
		'statusBar.noFolderForeground': '#6b6b6b',
		'statusBarItem.activeBackground': '#d6d6dd25',
		'statusBarItem.hoverBackground': '#d6d6dd20',
		'statusBarItem.remoteBackground': '#5b51ec',
		'statusBarItem.remoteForeground': '#d6d6dd',
		'tab.activeBackground': '#181818',
		'tab.activeBorder': '#d6d6dd00',
		'tab.activeBorderTop': '#d6d6dd',
		'tab.activeForeground': '#d6d6dd',
		'tab.border': '#d6d6dd00',
		'tab.hoverBorder': '#6d6d7071',
		'tab.hoverForeground': '#d6d6dd',
		'tab.inactiveBackground': '#292929',
		'tab.inactiveForeground': '#d6d6dd',
		'terminal.ansiBlack': '#676767',
		'terminal.ansiBlue': '#4c9df3',
		'terminal.ansiBrightBlack': '#676767',
		'terminal.ansiBrightBlue': '#4c9df3',
		'terminal.ansiBrightCyan': '#75d3ba',
		'terminal.ansiBrightGreen': '#15ac91',
		'terminal.ansiBrightMagenta': '#e567dc',
		'terminal.ansiBrightRed': '#f14c4c',
		'terminal.ansiBrightWhite': '#d6d6dd',
		'terminal.ansiBrightYellow': '#e5b95c',
		'terminal.ansiCyan': '#75d3ba',
		'terminal.ansiGreen': '#15ac91',
		'terminal.ansiMagenta': '#e567dc',
		'terminal.ansiRed': '#f14c4c',
		'terminal.ansiWhite': '#d6d6dd',
		'terminal.ansiYellow': '#e5b95c',
		'terminal.background': '#191919',
		'terminal.border': '#383838',
		'terminal.foreground': '#d6d6dd',
		'terminal.selectionBackground': '#636262fd',
		'terminalCursor.background': '#5b51ec',
		'terminalCursor.foreground': '#d6d6dd',
		'textLink.foreground': '#228df2',
		'titleBar.activeBackground': '#292929',
		'titleBar.activeForeground': '#d1d1d1',
		'titleBar.border': '#383838',
		'titleBar.inactiveBackground': '#3c3b3c',
		'titleBar.inactiveForeground': '#cccccc99',
		'tree.indentGuidesStroke': '#d6d6dd00',
		'walkThrough.embeddedEditorBackground': '#00000050',
		'widget.shadow': '#111111eb'
	},
	rules: [
		{
			foreground: '#E394DC',
			token: 'attribute.value.html'
		},
		{
			foreground: '#AAA0FA',
			token: 'attribute.name.html'
		},
		{
			foreground: '#87C3FF',
			token: 'tag.html'
		},
		// Added the above, can likely get rid of most the below
		{
			foreground: '#A8CC7C',
			fontStyle: '',
			token: 'string.quoted.binary.single.python'
		},
		{
			foreground: '#82D2CE',
			fontStyle: '',
			token: 'constant.language.false.cpp'
		},
		{
			foreground: '#82D2CE',
			fontStyle: '',
			token: 'constant.language.true.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.delayed.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.begin.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.end.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.ability.begin.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.ability.end.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.operator.assignment.as.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.pipe.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.delimiter.unison'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.hash.unison'
		},
		{
			foreground: '#A8CC7C',
			token: 'keyword.control.directive'
		},
		{
			foreground: '#D1D1D1',
			fontStyle: '',
			token: 'constant.other.ellipsis.python'
		},
		{
			foreground: '#83D6C5',
			token: 'variable.other.generic-type.haskell'
		},
		{
			foreground: '#898989',
			fontStyle: '',
			token: 'punctuation.definition.tag'
		},
		{
			foreground: '#F8C762',
			token: 'storage.type.haskell'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.variable.magic.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.period.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.element.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.parenthesis.begin.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.parenthesis.end.python'
		},
		{
			foreground: '#EFB080',
			token: 'variable.parameter.function.language.special.self.python'
		},
		{
			foreground: '#82D2CE',
			fontStyle: '',
			token: 'variable.language.this.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'storage.modifier.lifetime.rust'
		},
		{
			foreground: '#AAA0FA',
			token: 'support.function.std.rust'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.lifetime.rust'
		},
		{
			foreground: '#AA9BF5',
			token: 'variable.other.property'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.language.rust'
		},
		{
			foreground: '#83D6C5',
			token: 'support.constant.edge'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.other.character-class.regexp'
		},
		{
			foreground: '#F8C762',
			token: 'keyword.operator.quantifier.regexp'
		},
		{
			foreground: '#E394DC',
			token: 'punctuation.definition.string.begin'
		},
		{
			foreground: '#E394DC',
			token: 'punctuation.definition.string.end'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.parameter.function'
		},
		{
			foreground: '#6D6D6D',
			token: 'comment markup.link'
		},
		{
			foreground: '#EFB080',
			token: 'markup.changed.diff'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.diff.header.from-file'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.diff.header.to-file'
		},
		{
			foreground: '#AAA0FA',
			token: 'punctuation.definition.from-file.diff'
		},
		{
			foreground: '#AAA0FA',
			token: 'punctuation.definition.to-file.diff'
		},
		{
			foreground: '#E394DC',
			token: 'markup.inserted.diff'
		},
		{
			foreground: '#D6D6DD',
			token: 'markup.deleted.diff'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.function.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.function.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.begin.bracket.curly.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.end.bracket.curly.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.terminator.statement.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.begin.bracket.curly.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.end.bracket.curly.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.parens.begin.bracket.round.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.parens.end.bracket.round.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.parameters.begin.bracket.round.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.parameters.end.bracket.round.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.key-value'
		},
		{
			foreground: '#AAA0FA',
			token: 'keyword.operator.expression.import'
		},
		{
			foreground: '#EFB080',
			token: 'support.constant.math'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.property.math'
		},
		{
			foreground: '#EFB080',
			token: 'variable.other.constant'
		},
		{
			foreground: '#AA9BF5',
			token: 'variable.other.constant'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.annotation.java'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.object.array.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'source.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.begin.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.block.end.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.method-parameters.begin.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.method-parameters.end.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.method.identifier.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.method.begin.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.method.end.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.terminator.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.class.begin.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.class.end.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.inner-class.begin.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.inner-class.end.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.method-call.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.class.begin.bracket.curly.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.class.end.bracket.curly.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.method.begin.bracket.curly.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.method.end.bracket.curly.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.period.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.bracket.angle.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.annotation.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.method.body.java'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.method.java'
		},
		{
			foreground: '#EFB080',
			token: 'storage.modifier.import.java'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.java'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.generic.java'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.instanceof.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.definition.variable.name.java'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.logical'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.bitwise'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.channel'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.css'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.scss'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.less'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.color.w3c-standard-color-name.css'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.color.w3c-standard-color-name.scss'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.list.comma.css'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.color.w3c-standard-color-name.css'
		},
		{
			foreground: '#EFB080',
			token: 'support.module.node'
		},
		{
			foreground: '#EFB080',
			token: 'support.type.object.module'
		},
		{
			foreground: '#EFB080',
			token: 'support.module.node'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.type.module'
		},
		{
			foreground: '#D6D6DD',
			token: ''
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.object-literal.key'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.variable.object.process'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.variable.object.node'
		},
		{
			foreground: '#94C1FA',
			token: 'variable.other.readwrite'
		},
		{
			foreground: '#AA9BF5',
			token: 'support.variable.property'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.json'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.instanceof'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.new'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.ternary'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.optional'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.keyof'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.type.object.console'
		},
		{
			foreground: '#F8C762',
			token: 'support.variable.property.process'
		},
		{
			foreground: '#EBC88D',
			token: 'entity.name.function.js'
		},
		{
			foreground: '#EBC88D',
			token: 'support.function.console.js'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.misc.rust'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.sigil.rust'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.delete'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.type.object.dom'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.variable.dom'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.variable.property.dom'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.arithmetic'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.comparison'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.decrement'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.increment'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.relational'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.assignment.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.comparison.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.increment.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.decrement.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.bitwise.shift.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.assignment.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.comparison.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.increment.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.decrement.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.bitwise.shift.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.delimiter'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.separator.c'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.separator.cpp'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.type.posix-reserved.c'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.type.posix-reserved.cpp'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.sizeof.c'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.sizeof.cpp'
		},
		{
			foreground: '#F8C762',
			token: 'variable.parameter.function.language.python'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.python'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.logical.python'
		},
		{
			foreground: '#F8C762',
			token: 'variable.parameter.function.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.arguments.begin.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.arguments.end.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.arguments.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.begin.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.end.python'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.function-call.generic.python'
		},
		{
			foreground: '#F8C762',
			token: 'constant.character.format.placeholder.other.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.assignment.compound'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.assignment.compound.js'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.assignment.compound.ts'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword'
		},
		{
			foreground: '#D1D1D1',
			token: 'entity.name.namespace'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.c'
		},
		{
			foreground: '#C1808A',
			token: 'variable.language'
		},
		{
			foreground: '#D6D6DD',
			token: 'token.variable.parameter.java'
		},
		{
			foreground: '#EFB080',
			token: 'import.storage.java'
		},
		{
			foreground: '#83D6C5',
			token: 'token.package.keyword'
		},
		{
			foreground: '#D6D6DD',
			token: 'token.package'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.type.namespace'
		},
		{
			foreground: '#87C3FF',
			token: 'support.class'
		},
		{
			foreground: '#87C3FF',
			token: ' entity.name.type.class'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.class.identifier.namespace.type'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.class'
		},
		{
			foreground: '#EFB080',
			token: 'variable.other.class.js'
		},
		{
			foreground: '#EFB080',
			token: 'variable.other.class.ts'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.other.class.php'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.type'
		},
		{
			foreground: '#A8CC7C',
			token: 'keyword.control.directive.include.cpp'
		},
		{
			foreground: '#F8C762',
			token: 'control.elements'
		},
		{
			foreground: '#F8C762',
			token: ' keyword.operator.less'
		},
		{
			foreground: '#AAA0FA',
			token: 'keyword.other.special-method'
		},
		{
			foreground: '#82D2CE',
			token: 'storage'
		},
		{
			foreground: '#D1D1D1',
			fontStyle: '',
			token: 'storage.modifier.reference'
		},
		{
			foreground: '#D1D1D1',
			fontStyle: '',
			token: 'storage.modifier.pointer'
		},
		{
			foreground: '#83D6C5',
			token: 'token.storage'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.delete'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.in'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.of'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.instanceof'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.new'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.typeof'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.expression.void'
		},
		{
			foreground: '#EFB080',
			token: 'token.storage.type.java'
		},
		{
			foreground: '#EFB080',
			token: 'support.function'
		},
		{
			foreground: '#87C3FF',
			fontStyle: '',
			token: 'meta.property-name.css'
		},
		{
			foreground: '#FAD075',
			token: 'meta.tag'
		},
		{
			foreground: '#E394DC',
			token: 'string'
		},
		{
			foreground: '#EFB080',
			token: 'entity.other.inherited-class'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.other.symbol'
		},
		{
			foreground: '#EBC88D',
			token: 'constant.numeric'
		},
		{
			foreground: '#EBC88D',
			token: 'constant.other.color'
		},
		{
			foreground: '#F8C762',
			token: 'punctuation.definition.constant'
		},
		{
			foreground: '#AF9CFF',
			token: 'entity.name.tag.template'
		},
		{
			foreground: '#AF9CFF',
			token: 'entity.name.tag.script'
		},
		{
			foreground: '#AF9CFF',
			token: 'entity.name.tag.style'
		},
		{
			foreground: '#87C3FF',
			token: 'entity.name.tag.html'
		},
		{
			foreground: '#E394DC',
			fontStyle: '',
			token: 'meta.property-value.css'
		},
		{
			foreground: '#AAA0FA',
			token: 'entity.other.attribute-name'
		},
		{
			foreground: '#AAA0FA',
			fontStyle: '',
			token: 'entity.other.attribute-name.id'
		},
		{
			foreground: '#F8C762',
			fontStyle: '',
			token: 'entity.other.attribute-name.class.css'
		},
		{
			foreground: '#83D6C5',
			token: 'meta.selector'
		},
		{
			foreground: '#D6D6DD',
			token: 'markup.heading'
		},
		{
			foreground: '#AAA0FA',
			token: 'markup.heading punctuation.definition.heading'
		},
		{
			foreground: '#AAA0FA',
			token: ' entity.name.section'
		},
		{
			foreground: '#EBC88D',
			token: 'keyword.other.unit'
		},
		{
			foreground: '#F8C762',
			token: 'markup.bold'
		},
		{
			foreground: '#F8C762',
			token: 'todo.bold'
		},
		{
			foreground: '#EFB080',
			token: 'punctuation.definition.bold'
		},
		{
			foreground: '#83D6C5',
			token: 'markup.italic'
		},
		{
			foreground: '#83D6C5',
			token: ' punctuation.definition.italic'
		},
		{
			foreground: '#83D6C5',
			token: 'todo.emphasis'
		},
		{
			foreground: '#83D6C5',
			token: 'emphasis md'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.name.section.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.heading.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.begin.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'markup.heading.setext'
		},
		{
			foreground: '#F8C762',
			token: 'punctuation.definition.bold.markdown'
		},
		{
			foreground: '#E394DC',
			token: 'markup.inline.raw.markdown'
		},
		{
			foreground: '#E394DC',
			token: 'markup.inline.raw.string.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.list.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.string.begin.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.string.end.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.metadata.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'beginning.punctuation.definition.list.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.metadata.markdown'
		},
		{
			foreground: '#83D6C5',
			token: 'markup.underline.link.markdown'
		},
		{
			foreground: '#83D6C5',
			token: 'markup.underline.link.image.markdown'
		},
		{
			foreground: '#AAA0FA',
			token: 'string.other.link.title.markdown'
		},
		{
			foreground: '#AAA0FA',
			token: 'string.other.link.description.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'string.regexp'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.character.escape'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.embedded'
		},
		{
			foreground: '#D6D6DD',
			token: ' variable.interpolation'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.section.embedded.begin'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.section.embedded.end'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.illegal'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.illegal.bad-ampersand.html'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.broken'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.deprecated'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.unimplemented'
		},
		{
			foreground: '#D6D6DD',
			token: 'source.json meta.structure.dictionary.json > string.quoted.json'
		},
		{
			foreground: '#D6D6DD',
			token:
				'source.json meta.structure.dictionary.json > string.quoted.json > punctuation.string'
		},
		{
			foreground: '#E394DC',
			token:
				'source.json meta.structure.dictionary.json > value.json > string.quoted.json'
		},
		{
			foreground: '#E394DC',
			token:
				'source.json meta.structure.array.json > value.json > string.quoted.json'
		},
		{
			foreground: '#E394DC',
			token:
				'source.json meta.structure.dictionary.json > value.json > string.quoted.json > punctuation'
		},
		{
			foreground: '#E394DC',
			token:
				'source.json meta.structure.array.json > value.json > string.quoted.json > punctuation'
		},
		{
			foreground: '#D6D6DD',
			token:
				'source.json meta.structure.dictionary.json > constant.language.json'
		},
		{
			foreground: '#D6D6DD',
			token: 'source.json meta.structure.array.json > constant.language.json'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.property-name.json'
		},
		{
			foreground: '#83D6C5',
			token:
				'text.html.laravel-blade source.php.embedded.line.html entity.name.tag.laravel-blade'
		},
		{
			foreground: '#83D6C5',
			token:
				'text.html.laravel-blade source.php.embedded.line.html support.constant.laravel-blade'
		},
		{
			foreground: '#EFB080',
			token: 'support.other.namespace.use.php'
		},
		{
			foreground: '#EFB080',
			token: 'support.other.namespace.use-as.php'
		},
		{
			foreground: '#EFB080',
			token: 'support.other.namespace.php'
		},
		{
			foreground: '#EFB080',
			token: 'entity.other.alias.php'
		},
		{
			foreground: '#EFB080',
			token: 'meta.interface.php'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.error-control.php'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.type.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.array.begin.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.array.end.php'
		},
		{
			foreground: '#F44747',
			token: 'invalid.illegal.non-null-typehinted.php'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.php'
		},
		{
			foreground: '#EFB080',
			token: 'meta.other.type.phpdoc.php'
		},
		{
			foreground: '#EFB080',
			token: 'keyword.other.type.php'
		},
		{
			foreground: '#EFB080',
			token: 'keyword.other.array.phpdoc.php'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.function-call.php'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.function-call.object.php'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.function-call.static.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.parameters.begin.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.parameters.end.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.separator.delimiter.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.scope.begin.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.section.scope.end.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.terminator.expression.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.arguments.begin.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.arguments.end.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.storage-type.begin.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.storage-type.end.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.array.begin.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.array.end.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.begin.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.end.bracket.round.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.begin.bracket.curly.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.end.bracket.curly.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.section.switch-block.end.bracket.curly.php'
		},
		{
			foreground: '#D6D6DD',
			token:
				'punctuation.definition.section.switch-block.start.bracket.curly.php'
		},
		{
			foreground: '#D6D6DD',
			token:
				'punctuation.definition.section.switch-block.begin.bracket.curly.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.section.switch-block.end.bracket.curly.php'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.core.rust'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.ext.php'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.std.php'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.core.php'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.parser-token.php'
		},
		{
			foreground: '#AAA0FA',
			token: 'entity.name.goto-label.php'
		},
		{
			foreground: '#AAA0FA',
			token: 'support.other.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.logical.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.bitwise.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.arithmetic.php'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.regexp.php'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.comparison.php'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.heredoc.php'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.nowdoc.php'
		},
		{
			foreground: '#A8CC7C',
			token: 'meta.function.decorator.python'
		},
		{
			foreground: '#A8CC7C',
			fontStyle: '',
			token: 'punctuation.definition.decorator.python'
		},
		{
			foreground: '#A8CC7C',
			fontStyle: '',
			token: 'entity.name.function.decorator.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.token.decorator.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.function.decorator.identifier.python'
		},
		{
			foreground: '#D6D6DD',
			token: 'function.parameter'
		},
		{
			foreground: '#D6D6DD',
			token: 'function.brace'
		},
		{
			foreground: '#D6D6DD',
			token: 'function.parameter.ruby'
		},
		{
			foreground: '#D6D6DD',
			token: ' function.parameter.cs'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.language.symbol.ruby'
		},
		{
			foreground: '#D6D6DD',
			token: 'rgb-value'
		},
		{
			foreground: '#F8C762',
			token: 'inline-color-decoration rgb-value'
		},
		{
			foreground: '#F8C762',
			token: 'less rgb-value'
		},
		{
			foreground: '#D6D6DD',
			token: 'selector.sass'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.primitive.ts'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.builtin.ts'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.primitive.tsx'
		},
		{
			foreground: '#82D2CE',
			token: 'support.type.builtin.tsx'
		},
		{
			foreground: '#D6D6DD',
			token: 'block.scope.end'
		},
		{
			foreground: '#D6D6DD',
			token: 'block.scope.begin'
		},
		{
			foreground: '#EFB080',
			token: 'storage.type.cs'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.name.variable.local.cs'
		},
		{
			foreground: '#AAA0FA',
			token: 'token.info-token'
		},
		{
			foreground: '#F8C762',
			token: 'token.warn-token'
		},
		{
			foreground: '#F44747',
			token: 'token.error-token'
		},
		{
			foreground: '#83D6C5',
			token: 'token.debug-token'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.definition.template-expression.begin'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.definition.template-expression.end'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.section.embedded'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.template.expression'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.module'
		},
		{
			foreground: '#AAA0FA',
			token: 'support.type.type.flowtype'
		},
		{
			foreground: '#EFB080',
			token: 'support.type.primitive'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.property.object'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.parameter.function.js'
		},
		{
			foreground: '#E394DC',
			token: 'keyword.other.template.begin'
		},
		{
			foreground: '#E394DC',
			token: 'keyword.other.template.end'
		},
		{
			foreground: '#E394DC',
			token: 'keyword.other.substitution.begin'
		},
		{
			foreground: '#E394DC',
			token: 'keyword.other.substitution.end'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.operator.assignment'
		},
		{
			foreground: '#EFB080',
			token: 'keyword.operator.assignment.go'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.arithmetic.go'
		},
		{
			foreground: '#83D6C5',
			token: 'keyword.operator.address.go'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.package.go'
		},
		{
			foreground: '#D6D6DD',
			token: 'support.type.prelude.elm'
		},
		{
			foreground: '#F8C762',
			token: 'support.constant.elm'
		},
		{
			foreground: '#83D6C5',
			token: 'punctuation.quasi.element'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.character.entity'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.other.attribute-name.pseudo-element'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.other.attribute-name.pseudo-class'
		},
		{
			foreground: '#EFB080',
			token: 'entity.global.clojure'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.symbol.clojure'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.keyword.clojure'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.arguments.coffee'
		},
		{
			foreground: '#D6D6DD',
			token: 'variable.parameter.function.coffee'
		},
		{
			foreground: '#E394DC',
			token: 'source.ini'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.scope.prerequisites.makefile'
		},
		{
			foreground: '#EFB080',
			token: 'source.makefile'
		},
		{
			foreground: '#EFB080',
			token: 'storage.modifier.import.groovy'
		},
		{
			foreground: '#AAA0FA',
			token: 'meta.method.groovy'
		},
		{
			foreground: '#D6D6DD',
			token: 'meta.definition.variable.name.groovy'
		},
		{
			foreground: '#E394DC',
			token: 'meta.definition.class.inherited.classes.groovy'
		},
		{
			foreground: '#EFB080',
			token: 'support.variable.semantic.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.texture.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.sampler.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.object.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.object.rw.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.fx.hlsl'
		},
		{
			foreground: '#83D6C5',
			token: 'support.type.object.hlsl'
		},
		{
			foreground: '#D6D6DD',
			token: 'text.variable'
		},
		{
			foreground: '#D6D6DD',
			token: 'text.bracketed'
		},
		{
			foreground: '#EFB080',
			token: 'support.type.swift'
		},
		{
			foreground: '#EFB080',
			token: 'support.type.vb.asp'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.function.xi'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.name.class.xi'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.character.character-class.regexp.xi'
		},
		{
			foreground: '#83D6C5',
			token: 'constant.regexp.xi'
		},
		{
			foreground: '#D6D6DD',
			token: 'keyword.control.xi'
		},
		{
			foreground: '#D6D6DD',
			token: 'invalid.xi'
		},
		{
			foreground: '#E394DC',
			token: 'beginning.punctuation.definition.quote.markdown.xi'
		},
		{
			foreground: '#6D6D6D',
			token: 'beginning.punctuation.definition.list.markdown.xi'
		},
		{
			foreground: '#AAA0FA',
			token: 'constant.character.xi'
		},
		{
			foreground: '#AAA0FA',
			token: 'accent.xi'
		},
		{
			foreground: '#F8C762',
			token: 'wikiword.xi'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.other.color.rgb-value.xi'
		},
		{
			foreground: '#6D6D6D',
			token: 'punctuation.definition.tag.xi'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.label.cs'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.scope-resolution.function.call'
		},
		{
			foreground: '#EFB080',
			token: 'entity.name.scope-resolution.function.definition'
		},
		{
			foreground: '#D6D6DD',
			token: 'entity.name.label.cs'
		},
		{
			foreground: '#D6D6DD',
			token: 'markup.heading.setext.1.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'markup.heading.setext.2.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: ' meta.brace.square'
		},
		{
			foreground: '#6D6D6D',
			fontStyle: 'italic',
			token: 'comment'
		},
		{
			foreground: '#6D6D6D',
			fontStyle: 'italic',
			token: ' punctuation.definition.comment'
		},
		{
			foreground: '#6D6D6D',
			token: 'markup.quote.markdown'
		},
		{
			foreground: '#D6D6DD',
			token: 'punctuation.definition.block.sequence.item.yaml'
		},
		{
			foreground: '#D6D6DD',
			token: 'constant.language.symbol.elixir'
		},
		{
			fontStyle: 'italic',
			token: 'entity.other.attribute-name.js'
		},
		{
			fontStyle: 'italic',
			token: 'entity.other.attribute-name.ts'
		},
		{
			fontStyle: 'italic',
			token: 'entity.other.attribute-name.jsx'
		},
		{
			fontStyle: 'italic',
			token: 'entity.other.attribute-name.tsx'
		},
		{
			fontStyle: 'italic',
			token: 'variable.parameter'
		},
		{
			fontStyle: 'italic',
			token: 'variable.language.super'
		},
		{
			fontStyle: 'italic',
			token: 'comment.line.double-slash'
		},
		{
			fontStyle: 'italic',
			token: 'comment.block.documentation'
		},
		{
			fontStyle: 'italic',
			token: 'keyword.control.import.python'
		},
		{
			fontStyle: 'italic',
			token: 'keyword.control.flow.python'
		},
		{
			fontStyle: 'italic',
			token: 'markup.italic.markdown'
		}
	],
	encodedTokensColors: []
}
export default anysphere
