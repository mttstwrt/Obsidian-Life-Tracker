const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RAND_LEN = 16;

export function ulid(now: number = Date.now()): string {
	return encodeTime(now) + encodeRandom();
}

function encodeTime(ms: number): string {
	let n = Math.floor(ms);
	let out = "";
	for (let i = 0; i < TIME_LEN; i++) {
		out = ALPHABET[n % 32] + out;
		n = Math.floor(n / 32);
	}
	return out;
}

function encodeRandom(): string {
	const bytes = randomBytes(RAND_LEN);
	let out = "";
	for (let i = 0; i < RAND_LEN; i++) {
		out += ALPHABET[bytes[i] % 32];
	}
	return out;
}

function randomBytes(n: number): Uint8Array {
	const buf = new Uint8Array(n);
	const g: { crypto?: Crypto } = globalThis as unknown as {
		crypto?: Crypto;
	};
	if (g.crypto && typeof g.crypto.getRandomValues === "function") {
		g.crypto.getRandomValues(buf);
		return buf;
	}
	for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
	return buf;
}
