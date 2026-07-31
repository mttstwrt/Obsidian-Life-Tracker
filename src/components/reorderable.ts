/**
 * Long-press-to-drag reordering, applied to a list or table body.
 *
 * Attached once to the container; rows opt in with data attributes rather than
 * per-row handlers, so the same action drives flat lists (`<ul>`) and the grid
 * tables (`<tbody>`) without either component knowing how the drag works.
 *
 *   data-lt-id      definition id — required, marks the row as draggable
 *   data-lt-tab     which order key a drop commits to (habits/counters/…)
 *   data-lt-group   drag boundary; rows only reorder among matching values.
 *                   Defaults to data-lt-tab. The Overview needs these to
 *                   differ: habits and reverse habits share the `habits` key
 *                   but must not be draggable into each other.
 *   data-lt-handle  optional, on a descendant — restricts where a press may
 *                   start. The grid tables put it on the sticky name column so
 *                   long-pressing a day cell doesn't drag the row.
 */

const LONG_PRESS_MS = 400;
/** Movement past this before the timer fires means it's a scroll, not a hold. */
const MOVE_CANCEL_PX = 10;

export interface ReorderableOptions {
	/** Commits a drop: the order key, and the group's ids in their new order. */
	onReorder: (tab: string, ids: string[]) => void;
	/** Skip setting up drags entirely (e.g. the Overview's tag mode). */
	disabled?: boolean;
}

interface DragState {
	pointerId: number;
	row: HTMLElement;
	rows: HTMLElement[];
	tab: string;
	from: number;
	to: number;
}

function rowsInGroup(container: HTMLElement, group: string): HTMLElement[] {
	const all = Array.from(
		container.querySelectorAll<HTMLElement>("[data-lt-id]"),
	);
	return all.filter((el) => groupOf(el) === group);
}

function groupOf(el: HTMLElement): string {
	return el.dataset.ltGroup ?? el.dataset.ltTab ?? "";
}

export function reorderable(
	container: HTMLElement,
	options: ReorderableOptions,
) {
	let opts = options;
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let startX = 0;
	let startY = 0;
	let pending: { row: HTMLElement; pointerId: number } | null = null;
	let drag: DragState | null = null;
	/** Set when a drag actually ran, so the trailing click doesn't open a modal. */
	let suppressClick = false;

	// Non-passive so it can veto scrolling once a drag is live. Registered only
	// for the duration of a drag; by then the user has held still through the
	// long press, so the webview has not committed to a scroll yet.
	function blockTouchScroll(e: TouchEvent) {
		e.preventDefault();
	}

	function clearIndicators() {
		const marked = Array.from(
			container.querySelectorAll(
				".lt-reorder-drop-before, .lt-reorder-drop-after",
			),
		);
		for (const el of marked) {
			el.classList.remove("lt-reorder-drop-before", "lt-reorder-drop-after");
		}
	}

	function cancelPending() {
		if (pressTimer !== null) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
		pending = null;
	}

	function indexAtY(rows: HTMLElement[], y: number): number | null {
		for (let i = 0; i < rows.length; i++) {
			const rect = rows[i].getBoundingClientRect();
			if (y >= rect.top && y <= rect.bottom) return i;
		}
		return null;
	}

	function beginDrag(row: HTMLElement, pointerId: number) {
		const group = groupOf(row);
		const rows = rowsInGroup(container, group);
		const from = rows.indexOf(row);
		if (from === -1 || rows.length < 2) return;

		drag = {
			pointerId,
			row,
			rows,
			tab: row.dataset.ltTab ?? group,
			from,
			to: from,
		};
		row.classList.add("lt-reorder-lifted");
		container.classList.add("lt-reorder-active");
		try {
			container.setPointerCapture(pointerId);
		} catch {
			// Capture is a nicety; hit-testing still works without it.
		}
		document.addEventListener("touchmove", blockTouchScroll, {
			passive: false,
		});
		// A short buzz is the only signal on mobile that the hold registered.
		navigator.vibrate?.(15);
	}

	function updateTarget(clientY: number) {
		if (!drag) return;
		const found = indexAtY(drag.rows, clientY);
		let next = found;
		if (next === null) {
			// Past either end of the group — clamp so dragging out of the list
			// still parks the row at the nearest edge.
			const firstRect = drag.rows[0].getBoundingClientRect();
			next = clientY < firstRect.top ? 0 : drag.rows.length - 1;
		}
		drag.to = next;

		clearIndicators();
		if (next === drag.from) return;
		const marker = drag.rows[next];
		marker.classList.add(
			next < drag.from ? "lt-reorder-drop-before" : "lt-reorder-drop-after",
		);
	}

	function endDrag(commit: boolean) {
		if (!drag) return;
		const { row, rows, tab, from, to } = drag;

		row.classList.remove("lt-reorder-lifted");
		container.classList.remove("lt-reorder-active");
		clearIndicators();
		document.removeEventListener("touchmove", blockTouchScroll);
		try {
			container.releasePointerCapture(drag.pointerId);
		} catch {
			// Already released, or never captured.
		}
		drag = null;
		suppressClick = true;

		if (!commit || from === to) return;
		const ids = rows.map((el) => el.dataset.ltId ?? "");
		if (ids.some((id) => id === "")) return;
		const [moved] = ids.splice(from, 1);
		ids.splice(to, 0, moved);
		opts.onReorder(tab, ids);
	}

	function onPointerDown(e: PointerEvent) {
		// A drag doesn't always produce the trailing click it's meant to swallow —
		// touch in particular may synthesize none. Clear it as each new press
		// starts so a stale flag can't eat the next legitimate tap.
		suppressClick = false;
		if (opts.disabled || drag || e.button > 0) return;
		const target = e.target as HTMLElement | null;
		const row = target?.closest<HTMLElement>("[data-lt-id]");
		if (!row || !container.contains(row)) return;
		// Rows whose container declares a handle only drag from inside it.
		const handle = row.querySelector("[data-lt-handle]");
		if (handle && !handle.contains(target)) return;

		startX = e.clientX;
		startY = e.clientY;
		pending = { row, pointerId: e.pointerId };
		pressTimer = setTimeout(() => {
			pressTimer = null;
			if (pending) beginDrag(pending.row, pending.pointerId);
			pending = null;
		}, LONG_PRESS_MS);
	}

	function onPointerMove(e: PointerEvent) {
		if (drag) {
			if (e.pointerId !== drag.pointerId) return;
			e.preventDefault();
			updateTarget(e.clientY);
			return;
		}
		if (!pending) return;
		// Moving before the hold completes means the user is scrolling or
		// swiping; let them, and don't steal the gesture.
		const dx = Math.abs(e.clientX - startX);
		const dy = Math.abs(e.clientY - startY);
		if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) cancelPending();
	}

	function onPointerUp() {
		if (drag) {
			endDrag(true);
			return;
		}
		cancelPending();
	}

	function onPointerCancel() {
		if (drag) {
			endDrag(false);
			return;
		}
		cancelPending();
	}

	function onClick(e: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		// The drag started on a name/log button; without this the pointerup that
		// ends the drag also fires that button's click.
		e.preventDefault();
		e.stopPropagation();
	}

	function onContextMenu(e: Event) {
		// iOS raises the long-press callout right as the hold completes.
		if (drag || pending) e.preventDefault();
	}

	/**
	 * Keyboard equivalent, since dragging replaced the reorder dialog that used
	 * to be the only non-pointer way to do this. Alt+Arrow moves the focused row.
	 */
	function onKeyDown(e: KeyboardEvent) {
		if (opts.disabled || !e.altKey) return;
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		const target = e.target as HTMLElement | null;
		const row = target?.closest<HTMLElement>("[data-lt-id]");
		if (!row || !container.contains(row)) return;

		const rows = rowsInGroup(container, groupOf(row));
		const from = rows.indexOf(row);
		const to = e.key === "ArrowUp" ? from - 1 : from + 1;
		if (from === -1 || to < 0 || to >= rows.length) return;

		e.preventDefault();
		const ids = rows.map((el) => el.dataset.ltId ?? "");
		if (ids.some((id) => id === "")) return;
		const [moved] = ids.splice(from, 1);
		ids.splice(to, 0, moved);
		opts.onReorder(row.dataset.ltTab ?? groupOf(row), ids);
		// The row is re-rendered at its new position; keep focus with the user.
		queueMicrotask(() => {
			container
				.querySelector<HTMLElement>(
					`[data-lt-id="${CSS.escape(moved)}"] button, [data-lt-id="${CSS.escape(moved)}"]`,
				)
				?.focus();
		});
	}

	container.addEventListener("pointerdown", onPointerDown);
	container.addEventListener("pointermove", onPointerMove);
	container.addEventListener("pointerup", onPointerUp);
	container.addEventListener("pointercancel", onPointerCancel);
	container.addEventListener("click", onClick, true);
	container.addEventListener("contextmenu", onContextMenu);
	container.addEventListener("keydown", onKeyDown);

	return {
		update(next: ReorderableOptions) {
			opts = next;
		},
		destroy() {
			cancelPending();
			endDrag(false);
			document.removeEventListener("touchmove", blockTouchScroll);
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("pointermove", onPointerMove);
			container.removeEventListener("pointerup", onPointerUp);
			container.removeEventListener("pointercancel", onPointerCancel);
			container.removeEventListener("click", onClick, true);
			container.removeEventListener("contextmenu", onContextMenu);
			container.removeEventListener("keydown", onKeyDown);
		},
	};
}
