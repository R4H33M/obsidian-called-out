import { App, FuzzyMatch, FuzzySuggestModal, Plugin, SectionCache, TFile, EditorRange, Editor, Vault } from 'obsidian';

interface Callout {
	file: TFile;
	type: string;
	title: string;
	section: SectionCache;
}

type CalledOutAction = "link" | "open";

export default class CalledOut extends Plugin {

	async onload() {
		this.addCommand({
			id: "open-callout-jump",
			name: "Jump to your named callouts",
			callback: async () => {
				const callouts: Callout[] = await this.getCalloutsWithNames(this.app);

				new CalloutSearchModal({
					app: this.app,
					plugin: this,
					callouts,
					action: "open",
				}).open();
			},
		});

		this.addCommand({
			id: "open-callout-link",
			name: "Link your named callouts",
			callback: async () => {
				const callouts: Callout[] = await this.getCalloutsWithNames(this.app);

				new CalloutSearchModal({
					app: this.app,
					plugin: this,
					callouts,
					action: "link",
				}).open();
			},
		});

	}

	onunload() { }

	async getCalloutsWithNames(app: App): Promise<Callout[]> {

		const callouts: Callout[] = [];

		for (const file of app.vault.getMarkdownFiles()) {

			callouts.push(...await this.processFile(app, file));
		}

		return callouts;

	}

	async processFile(app: App, file: TFile): Promise<Callout[]> {

		const fileContent = await app.vault.cachedRead(file);

		const cache = app.metadataCache.getFileCache(file);
		if (!cache || !cache.sections) return [];

		const fileCallouts: Callout[] = [];

		const callouts = cache.sections.filter(
			(section) => section.type === "callout"
		);

		for (const callout of callouts) {
			const calloutContent = fileContent.slice(
				callout.position.start.offset,
				callout.position.end.offset
			);

			const calloutRegex: RegExp = /^>\[!(.*)\](.*)$/m;
			const match = calloutContent.match(calloutRegex);

			if (!match || !match[1] || !match[2]) continue;

			const calloutType = match[1].trim();
			const calloutTitle = match[2].trim();

			if (calloutTitle === "") continue;

			fileCallouts.push({
				file: file,
				type: calloutType,
				title: calloutTitle,
				section: callout
			});
		}
		return fileCallouts;
	}
}

class CalloutSearchModal extends FuzzySuggestModal<Callout> {
	plugin: CalledOut;
	callouts: Callout[];
	action: CalledOutAction;

	constructor({ app, plugin, callouts, action }: {
		app: App;
		plugin: CalledOut;
		callouts: Callout[];
		action: CalledOutAction;
	}) {
		super(app);
		this.plugin = plugin;
		this.callouts = callouts;
		this.action = action;

		if (action == "open") {
			this.setPlaceholder("Jump to named callouts...");
		} else if (action == "link") {
			this.setPlaceholder("Link to named callouts...");
		}

		this.limit = 10; // TODO make this a setting later
	}

	onOpen() {
		super.onOpen();
	}

	getItems(): Callout[] {
		return this.callouts;
	}

	getItemText(item: Callout): string {
		let toSearch = "";

		toSearch += item.title; //Only search callout title for now

		return toSearch;
	}



	renderSuggestion(item: FuzzyMatch<Callout>, el: HTMLElement): void {

		const callout: Callout = item.item;

		const calloutText: string = `${callout.title} (${callout.type})`;

		const toDisplay = document.createDocumentFragment()
			.appendChild(document.createTextNode(calloutText));

		el.createDiv({ cls: "suggestion-content" }, (contentDiv) => {
			contentDiv.createDiv({
				cls: "called-out-suggestion-callout-text"
			})
				.appendChild(toDisplay);

			const calloutFile = callout.file.path;

			contentDiv.createEl("small", {
				text: calloutFile,
				cls: "called-out-suggestion-callout-file",
			});

		});
	}

	async onChooseItem(callout: Callout, _: MouseEvent | KeyboardEvent) {

		const calloutStartLine = callout.section.position.start.line;
		const calloutEndLine = callout.section.position.end.line;
		const workspace = this.app.workspace;

		if (this.action === "open") {
			await workspace.openLinkText(callout.file.path, "", false);

			this.app.workspace.activeEditor?.editor?.setCursor(
				calloutStartLine - 1,
				0
			);

			const range: EditorRange = {
				from: { line: calloutStartLine - 1, ch: 0 },
				to: { line: calloutEndLine + 1, ch: 0 }
			};

			workspace.activeEditor?.editor?.scrollIntoView(range, true);
		} else if (this.action === "link") {
			
			const vault = this.app.vault;
			const editor = this.app.workspace.activeEditor?.editor;
			if (!editor) return;

			linkCallout(callout, editor, vault);

		}
	}
}

function generateId(calloutTitle: string): string {

	const seperator = "-";

	let idPrefix: string = calloutTitle
		.replace(/ /g, seperator).replace(/[^0-9a-zA-Z\-]/g, "");

	const idSuffix: string = Math.random().toString(36).slice(2, 6);

	return idPrefix + seperator + idSuffix;

}


async function linkCallout(callout: Callout, editor: Editor, vault: Vault) {

	const file = callout.file;
	if (!editor) return;

	const section = callout.section;
	let blockId = section.id;

	if (!blockId) {
		const offset = section.position.end.offset;

		blockId = generateId(callout.title);
		const spacer = "\n>";

		const fileContents = await vault.read(file);
		const prefix = fileContents.slice(0, offset);
		const suffix = fileContents.slice(offset);
		vault.modify(file,
			prefix + spacer + "^" + blockId + suffix
		)
	}

	editor.replaceRange(this.app.fileManager.generateMarkdownLink(
		file,
		"",
		"#^" + blockId,
		callout.title
	), editor.getCursor());

}
