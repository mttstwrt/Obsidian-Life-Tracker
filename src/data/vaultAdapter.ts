import type { TFile, Vault } from "obsidian";

export interface VaultFileInfo {
	path: string;
	mtime: number;
}

export interface VaultAdapter {
	list(folder: string): Promise<VaultFileInfo[]>;
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	create(path: string, content: string): Promise<void>;
	ensureFolder(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	delete(path: string): Promise<void>;
	mtime(path: string): Promise<number | null>;
}

export class ObsidianVaultAdapter implements VaultAdapter {
	constructor(private vault: Vault) {}

	async list(folder: string): Promise<VaultFileInfo[]> {
		const prefix = folder.endsWith("/") ? folder : `${folder}/`;
		const out: VaultFileInfo[] = [];
		for (const file of this.vault.getMarkdownFiles()) {
			if (file.path.startsWith(prefix)) {
				out.push({ path: file.path, mtime: file.stat.mtime });
			}
		}
		return out;
	}

	async exists(path: string): Promise<boolean> {
		return this.vault.getAbstractFileByPath(path) !== null;
	}

	async read(path: string): Promise<string> {
		const file = this.requireFile(path);
		return this.vault.read(file);
	}

	async write(path: string, content: string): Promise<void> {
		const file = this.requireFile(path);
		await this.vault.modify(file, content);
	}

	async create(path: string, content: string): Promise<void> {
		await this.vault.create(path, content);
	}

	async ensureFolder(path: string): Promise<void> {
		const trimmed = path.replace(/^\/+|\/+$/g, "");
		if (!trimmed) return;
		const segments = trimmed.split("/");
		let acc = "";
		for (const seg of segments) {
			acc = acc ? `${acc}/${seg}` : seg;
			if (this.vault.getAbstractFileByPath(acc)) continue;
			try {
				await this.vault.createFolder(acc);
			} catch {
				// race / already created — ignore
			}
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const file = this.requireFile(oldPath);
		await this.vault.rename(file, newPath);
	}

	async delete(path: string): Promise<void> {
		const file = this.requireFile(path);
		await this.vault.delete(file);
	}

	async mtime(path: string): Promise<number | null> {
		const f = this.vault.getAbstractFileByPath(path);
		if (!f) return null;
		const tfile = f as TFile;
		return tfile.stat?.mtime ?? null;
	}

	private requireFile(path: string): TFile {
		const f = this.vault.getAbstractFileByPath(path);
		if (!f) throw new Error(`file not found: ${path}`);
		return f as TFile;
	}
}

export class InMemoryVaultAdapter implements VaultAdapter {
	private files = new Map<string, { content: string; mtime: number }>();
	private clock: () => number;

	constructor(initial?: Record<string, string>, clock: () => number = Date.now) {
		this.clock = clock;
		if (initial) {
			for (const [path, content] of Object.entries(initial)) {
				this.files.set(path, { content, mtime: this.clock() });
			}
		}
	}

	async list(folder: string): Promise<VaultFileInfo[]> {
		const prefix = folder.endsWith("/") ? folder : `${folder}/`;
		const out: VaultFileInfo[] = [];
		for (const [path, info] of this.files.entries()) {
			if (path.startsWith(prefix) && path.endsWith(".md")) {
				out.push({ path, mtime: info.mtime });
			}
		}
		return out;
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async read(path: string): Promise<string> {
		const info = this.files.get(path);
		if (!info) throw new Error(`file not found: ${path}`);
		return info.content;
	}

	async write(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) {
			throw new Error(`file not found: ${path}`);
		}
		this.files.set(path, { content, mtime: this.clock() });
	}

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) {
			throw new Error(`file already exists: ${path}`);
		}
		this.files.set(path, { content, mtime: this.clock() });
	}

	async ensureFolder(_path: string): Promise<void> {
		// in-memory adapter has no folder concept — files are flat by path
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const info = this.files.get(oldPath);
		if (!info) throw new Error(`file not found: ${oldPath}`);
		if (this.files.has(newPath)) {
			throw new Error(`file already exists: ${newPath}`);
		}
		this.files.delete(oldPath);
		this.files.set(newPath, { content: info.content, mtime: this.clock() });
	}

	async delete(path: string): Promise<void> {
		if (!this.files.delete(path)) {
			throw new Error(`file not found: ${path}`);
		}
	}

	async mtime(path: string): Promise<number | null> {
		return this.files.get(path)?.mtime ?? null;
	}

	snapshot(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [path, info] of this.files.entries()) {
			out[path] = info.content;
		}
		return out;
	}
}
