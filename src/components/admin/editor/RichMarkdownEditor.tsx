"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { marked } from "marked";
import { useEditorToolbar } from "@/components/admin/editor/EditorToolbarContext";

const PLACEHOLDER_DEFINITIONS = [
  {
    key: "roblox_link",
    shortLabel: "RB",
    defaultLabel: "Roblox link",
    title: "Insert Roblox placeholder link",
  },
  {
    key: "community_link",
    shortLabel: "CM",
    defaultLabel: "Community link",
    title: "Insert Community placeholder link",
  },
  {
    key: "discord_link",
    shortLabel: "DC",
    defaultLabel: "Discord server",
    title: "Insert Discord placeholder link",
  },
  {
    key: "twitter_link",
    shortLabel: "TW",
    defaultLabel: "Twitter profile",
    title: "Insert Twitter placeholder link",
  },
  {
    key: "youtube_link",
    shortLabel: "YT",
    defaultLabel: "YouTube channel",
    title: "Insert YouTube placeholder link",
  },
] as const;

type PlaceholderDefinition = (typeof PLACEHOLDER_DEFINITIONS)[number];

type EditorFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  orderedList: boolean;
  bulletList: boolean;
  blockquote: boolean;
  code: boolean;
  activeHeading: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

type RichMarkdownEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
};

const DEFAULT_FORMAT_STATE: EditorFormatState = {
  bold: false,
  italic: false,
  underline: false,
  orderedList: false,
  bulletList: false,
  blockquote: false,
  code: false,
  activeHeading: "p",
};

const PLACEHOLDER_CLASS = "md-placeholder-chip";

const PLACEHOLDER_PATTERN = /\[\[([a-z0-9_]+)\|([^\]]+)\]\]/gi;

const LINK_TOOLTIP_OFFSET = 8;

const EDITABLE_BLOCK_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "table",
]);

type SavedSelection = {
  start: number;
  end: number;
};

type LinkPreviewState = {
  href: string;
  top: number;
  left: number;
};

function escapeMarkdownText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]])/g, "\\$1")
    .replace(/(\\)(?=\s)/g, "\\\\");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

function isPlaceholderElement(node: Node | null): node is HTMLElement {
  return Boolean(node && node instanceof HTMLElement && node.classList.contains(PLACEHOLDER_CLASS));
}

function saveSelection(container: HTMLElement): SavedSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;
  const preSelectionRange = range.cloneRange();
  preSelectionRange.selectNodeContents(container);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  const start = preSelectionRange.toString().length;
  return { start, end: start + range.toString().length };
}

function restoreSelection(container: HTMLElement, saved: SavedSelection | null) {
  if (!saved) return;
  const range = document.createRange();
  range.setStart(container, 0);
  range.collapse(true);

  const stack: Node[] = [container];
  let node: Node | undefined;
  let charIndex = 0;
  let foundStart = false;
  let stop = false;

  while (!stop && (node = stack.pop())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      const length = text.length;
      if (!foundStart && saved.start <= charIndex + length) {
        range.setStart(node, saved.start - charIndex);
        foundStart = true;
      }
      if (foundStart && saved.end <= charIndex + length) {
        range.setEnd(node, saved.end - charIndex);
        stop = true;
      }
      charIndex += length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node === container) {
        const children = Array.from(node.childNodes);
        for (let i = children.length - 1; i >= 0; i -= 1) {
          stack.push(children[i]!);
        }
      } else {
        const children = Array.from(node.childNodes);
        for (let i = children.length - 1; i >= 0; i -= 1) {
          stack.push(children[i]!);
        }
      }
    }
  }

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function wrapPlaceholders(root: HTMLElement) {
  const savedSelection = saveSelection(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.match(PLACEHOLDER_PATTERN)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && isPlaceholderElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      textNodes.push(current as Text);
    }
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? "";
    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragments: Node[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    PLACEHOLDER_PATTERN.lastIndex = 0;
    while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
      const [raw, key, label] = match;
      const start = match.index;
      if (start > lastIndex) {
        fragments.push(document.createTextNode(text.slice(lastIndex, start)));
      }
      const span = document.createElement("span");
      span.className = PLACEHOLDER_CLASS;
      span.dataset.placeholderKey = key;
      const trimmedLabel = label.trim();
      span.dataset.placeholderLabel = trimmedLabel;
      span.contentEditable = "false";
      span.textContent = trimmedLabel;
      fragments.push(span);
      lastIndex = start + raw.length;
    }
    if (lastIndex < text.length) {
      fragments.push(document.createTextNode(text.slice(lastIndex)));
    }
    if (fragments.length) {
      fragments.forEach((fragment) => {
        parent.insertBefore(fragment, textNode);
      });
      parent.removeChild(textNode);
    }
  }

  restoreSelection(root, savedSelection);
}

function updateEmptyState(container: HTMLElement) {
  const text = container.textContent?.replace(/\u200b/g, "").trim() ?? "";
  if (text.length === 0 || container.innerHTML === "<p><br></p>" || container.innerHTML === "<p><br /></p>") {
    container.dataset.empty = "true";
  } else {
    delete container.dataset.empty;
  }
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(normalizeWhitespace(node.nodeValue ?? ""));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (isPlaceholderElement(element)) {
    const key = element.dataset.placeholderKey ?? "";
    const label = element.dataset.placeholderLabel ?? element.textContent ?? "";
    const normalized = label.trim();
    const safeLabel = normalized.replace(/]/g, "\\]").replace(/\|/g, "\\|");
    return `[[${key}|${safeLabel}]]`;
  }
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "br":
      return "  \n";
    case "strong":
    case "b":
      return `**${Array.from(element.childNodes).map(serializeInline).join("")}**`;
    case "em":
    case "i":
      return `*${Array.from(element.childNodes).map(serializeInline).join("")}*`;
    case "u":
      return `<u>${Array.from(element.childNodes).map(serializeInline).join("")}</u>`;
    case "code": {
      if (element.parentElement?.tagName.toLowerCase() === "pre") {
        return element.textContent ?? "";
      }
      const content = element.textContent ?? "";
      const hasBacktick = content.includes("`");
      const delimiter = hasBacktick ? "``" : "`";
      return `${delimiter}${content}${delimiter}`;
    }
    case "img": {
      const src = element.getAttribute("src") ?? "";
      if (!src) return "";
      const alt = element.getAttribute("alt") ?? "";
      const title = element.getAttribute("title");
      const titlePart = title ? ` "${title}"` : "";
      return `![${escapeMarkdownText(alt)}](${src}${titlePart})`;
    }
    case "a": {
      const href = element.getAttribute("href") ?? "";
      const label = Array.from(element.childNodes).map(serializeInline).join("") || href;
      return `[${label}](${href || "#"})`;
    }
    case "span":
      return Array.from(element.childNodes).map(serializeInline).join("");
    default:
      return Array.from(element.childNodes).map(serializeInline).join("");
  }
}

function serializeList(list: HTMLElement, ordered: boolean): string {
  const start = ordered ? Math.max(parseInt(list.getAttribute("start") ?? "1", 10) || 1, 1) : 1;
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
  const lines: string[] = [];
  items.forEach((item, index) => {
    const li = item as HTMLElement;
    const inlineParts: string[] = [];
    const blockParts: string[] = [];
    li.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child as HTMLElement;
        const childTag = childElement.tagName.toLowerCase();
        if (childTag === "ul" || childTag === "ol") {
          const nested = serializeList(childElement, childTag === "ol");
          if (nested) blockParts.push(nested);
          return;
        }
      }
      inlineParts.push(serializeInline(child));
    });
    const prefix = ordered ? `${start + index}. ` : "- ";
    const content = inlineParts.join("").trim();
    const baseLine = `${prefix}${content || ""}`.trimEnd();
    const nested = blockParts
      .map((part) => part.split("\n").map((line) => (line ? `  ${line}` : line)).join("\n"))
      .join("\n");
    if (nested) {
      lines.push(`${baseLine}\n${nested}`);
    } else {
      lines.push(baseLine);
    }
  });
  return lines.join("\n");
}

function serializeTable(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return "";

  const headerCells = Array.from(rows[0].querySelectorAll("th"));
  const hasHeader = headerCells.length > 0;

  const columnCount = hasHeader ? headerCells.length : rows[0].children.length;
  const header = hasHeader
    ? headerCells.map((cell) => ` ${Array.from(cell.childNodes).map(serializeInline).join("").trim()} `)
    : Array.from(rows[0].children).map((cell) => ` ${Array.from(cell.childNodes).map(serializeInline).join("").trim()} `);

  const align = Array.from({ length: columnCount }, () => " --- ");

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const body = dataRows
    .map((row) =>
      Array.from(row.children)
        .map((cell) => ` ${Array.from(cell.childNodes).map(serializeInline).join("").trim()} `)
        .join("|")
    )
    .join("\n");

  return [
    `|${header.join("|")}|`,
    `|${align.join("|")}|`,
    body ? body.split("\n").map((line) => `|${line}|`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? "";
    return text.trim() ? text.trim() : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "p": {
      const content = Array.from(element.childNodes).map(serializeInline).join("").trim();
      return content;
    }
    case "div": {
      const blocks = Array.from(element.childNodes)
        .map((child) => serializeBlock(child))
        .filter(Boolean);
      if (blocks.length) {
        return blocks.join("\n\n");
      }
      const content = Array.from(element.childNodes).map(serializeInline).join("").trim();
      return content;
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = parseInt(tag[1] ?? "1", 10);
      const content = Array.from(element.childNodes).map(serializeInline).join("").trim();
      return `${"#".repeat(level)} ${content}`.trim();
    }
    case "ul":
      return serializeList(element, false);
    case "ol":
      return serializeList(element, true);
    case "blockquote": {
      const inner = Array.from(element.childNodes)
        .map((child) => serializeBlock(child))
        .filter(Boolean)
        .join("\n\n");
      if (!inner) return ">";
      return inner
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
    }
    case "pre": {
      const code = element.querySelector("code");
      const raw = code ? code.textContent ?? "" : element.textContent ?? "";
      const langClass = code?.getAttribute("class") ?? "";
      const langMatch = langClass.match(/language-([a-z0-9]+)/i);
      const language = langMatch ? langMatch[1] : "";
      const cleaned = raw.replace(/\n+$/, "");
      return `\`\`\`${language}\n${cleaned}\n\`\`\``;
    }
    case "table":
      return serializeTable(element as HTMLTableElement);
    case "hr":
      return "---";
    case "img":
      return serializeInline(element);
    default:
      return Array.from(element.childNodes).map(serializeInline).join("").trim();
  }
}

async function markdownToEditableHtml(markdown: string): Promise<string> {
  if (!markdown) return "";
  const html = await marked.parse(markdown ?? "");
  const container = document.createElement("div");
  container.innerHTML = html ?? "";
  wrapPlaceholders(container);
  return container.innerHTML;
}

function ensureParagraph(container: HTMLElement) {
  if (!container.textContent || container.textContent.trim().length === 0) {
    container.innerHTML = "<p><br /></p>";
  }
}

function findBlockElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (EDITABLE_BLOCK_TAGS.has(el.tagName.toLowerCase())) {
        return el;
      }
    }
    current = current.parentNode;
  }
  return null;
}

function findNextEditableBlock(start: HTMLElement | null): HTMLElement | null {
  let next: Element | null = start?.nextElementSibling ?? null;
  while (next) {
    if (EDITABLE_BLOCK_TAGS.has(next.tagName.toLowerCase())) {
      return next as HTMLElement;
    }
    next = next.nextElementSibling;
  }
  return null;
}

function insertEmptyBlockAfter(block: HTMLElement | null, container: HTMLElement): HTMLElement {
  const parent = block?.parentElement ?? container;
  const tag = block?.tagName.toLowerCase() === "li" ? "li" : "p";
  const targetParent =
    tag === "li" && parent.tagName && ["ul", "ol"].includes(parent.tagName.toLowerCase()) ? parent : container;
  const newBlock = document.createElement(tag);
  newBlock.innerHTML = "<br />";
  const reference = block?.nextSibling ?? null;
  targetParent.insertBefore(newBlock, reference);
  return newBlock;
}

function isListContinuationFriendly(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? "").trim().length === 0;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return true;
  if (["p", "div", "figure"].includes(tag)) {
    const hasNestedLists = el.querySelector("ol,ul");
    if (hasNestedLists) return false;
    const hasImage = el.querySelector("img");
    if (!hasImage) return false;
    const text = el.textContent ?? "";
    return text.trim().length === 0 || Boolean(hasImage);
  }
  return false;
}

function normalizeOrderedLists(container: HTMLElement) {
  let lastEnd: number | null = null;
  let bufferFriendly = true;

  const children = Array.from(container.childNodes);
  for (const node of children) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === "ol") {
      const list = node as HTMLOListElement;
      const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
      const count = items.length;
      let startValue = 1;
      if (lastEnd !== null && bufferFriendly) {
        startValue = lastEnd + 1;
        list.setAttribute("start", String(startValue));
      } else {
        list.removeAttribute("start");
      }
      lastEnd = startValue + count - 1;
      bufferFriendly = true;
      continue;
    }
    if (lastEnd !== null) {
      bufferFriendly = bufferFriendly && isListContinuationFriendly(node);
    }
  }
}

export function RichMarkdownEditor({ label, value, onChange, placeholder, height }: RichMarkdownEditorProps) {
  const editorId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"rich" | "markdown">("markdown");
  const [formatState, setFormatState] = useState<EditorFormatState>(DEFAULT_FORMAT_STATE);
  const [activePlaceholder, setActivePlaceholder] = useState<HTMLElement | null>(null);
  const [activeTableCell, setActiveTableCell] = useState<HTMLTableCellElement | null>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewState | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarContext = useEditorToolbar();
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const lastMarkdownRef = useRef<string>(value ?? "");
  const isSettingContentRef = useRef(false);
  const lastSelectionRef = useRef<Range | null>(null);
  const hoveredLinkRef = useRef<HTMLAnchorElement | null>(null);
  const hideLinkPreviewTimeoutRef = useRef<number | null>(null);
  const hasToolbarContext = Boolean(toolbarContext);
  const isToolbarActive = !toolbarContext || toolbarContext.activeId === editorId;

  useEffect(() => {
    if (typeof document === "undefined") return;
    setToolbarHost(document.getElementById("editor-toolbar-slot"));
  }, []);

  const moveCaretToElementStart = useCallback((element: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    lastSelectionRef.current = range.cloneRange();
  }, []);

  const moveCaretToEnd = useCallback((container: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    lastSelectionRef.current = range.cloneRange();
  }, []);

  const restoreLastSelection = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    editorRef.current.focus();
    if (!selection) return;
    const saved = lastSelectionRef.current;
    if (!saved) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      lastSelectionRef.current = range;
      return;
    }
    const { startContainer, endContainer } = saved;
    if (
      !editorRef.current.contains(startContainer) ||
      !editorRef.current.contains(endContainer)
    ) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      lastSelectionRef.current = range;
      return;
    }
    selection.removeAllRanges();
    selection.addRange(saved);
  }, []);

  const updateMarkdown = useCallback(() => {
    if (!editorRef.current) return;
    const container = editorRef.current;
    ensureParagraph(container);
    normalizeOrderedLists(container);
    wrapPlaceholders(container);
    updateEmptyState(container);
    const markdown = Array.from(container.childNodes)
      .map((node) => serializeBlock(node))
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    lastMarkdownRef.current = markdown;
    onChange(markdown);
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (isSettingContentRef.current) return;
    const container = editorRef.current;
    const needsInitialRender = container.childNodes.length === 0 || container.dataset.empty === "true";
    if (!needsInitialRender && value === lastMarkdownRef.current) return;
    isSettingContentRef.current = true;
    void markdownToEditableHtml(value ?? "").then((html) => {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = html || "";
      ensureParagraph(editorRef.current);
      normalizeOrderedLists(editorRef.current);
      wrapPlaceholders(editorRef.current);
      updateEmptyState(editorRef.current);
      lastMarkdownRef.current = value ?? "";
      isSettingContentRef.current = false;
    });
  }, [value]);

  const refreshToolbarState = useCallback(() => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setFormatState(DEFAULT_FORMAT_STATE);
      setActivePlaceholder(null);
      setActiveTableCell(null);
      return;
    }
    const anchor = selection.anchorNode;
    if (!anchor || !editorRef.current.contains(anchor)) {
      setFormatState(DEFAULT_FORMAT_STATE);
      setActivePlaceholder(null);
      setActiveTableCell(null);
      return;
    }

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        lastSelectionRef.current = range.cloneRange();
      }
    }

    const bold = document.queryCommandState("bold");
    const italic = document.queryCommandState("italic");
    const underline = document.queryCommandState("underline");
    const orderedList = document.queryCommandState("insertOrderedList");
    const bulletList = document.queryCommandState("insertUnorderedList");
    const rawBlock = document.queryCommandValue("formatBlock");
    const blockValue = typeof rawBlock === "string" ? rawBlock.toLowerCase() : "p";
    const blockquote = blockValue === "blockquote";
    const code = blockValue === "pre";

    const headingMatch = /^(h[1-6])$/.exec(blockValue ?? "");

    setFormatState({
      bold: Boolean(bold),
      italic: Boolean(italic),
      underline: Boolean(underline),
      orderedList: Boolean(orderedList),
      bulletList: Boolean(bulletList),
      blockquote: Boolean(blockquote),
      code: Boolean(code),
      activeHeading: headingMatch ? (headingMatch[1] as EditorFormatState["activeHeading"]) : "p",
    });

    let placeholderElement: HTMLElement | null = null;

    const inspectNode = (startNode: Node | null) => {
      let node: Node | null = startNode;
      while (node && node !== editorRef.current) {
        if (isPlaceholderElement(node)) {
          placeholderElement = node;
          return;
        }
        node = node.parentNode;
      }
    };

    inspectNode(selection.anchorNode);
    if (!placeholderElement) {
      inspectNode(selection.focusNode);
    }
    const tableCell = selection.anchorNode
      ? (selection.anchorNode as HTMLElement | null)?.closest?.("td,th")
      : null;
    setActiveTableCell(tableCell as HTMLTableCellElement | null);
    setActivePlaceholder(placeholderElement);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => refreshToolbarState();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [refreshToolbarState]);

  useEffect(() => {
    if (editorRef.current) {
      updateEmptyState(editorRef.current);
    }
  }, []);

  useEffect(() => {
    if (!toolbarContext) return;
    if (toolbarContext.activeId === null) {
      toolbarContext.setActiveId(editorId);
    }
  }, [editorId, toolbarContext]);

  useEffect(() => {
    if (!isToolbarActive && showMoreMenu) {
      setShowMoreMenu(false);
    }
  }, [isToolbarActive, showMoreMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!moreMenuRef.current) return;
      if (event.target instanceof Node && moreMenuRef.current.contains(event.target)) return;
      setShowMoreMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMoreMenu]);

  useEffect(() => {
    if (!editorRef.current) return;
    const container = editorRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (mode !== "rich") return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      const selection = window.getSelection();
      const currentBlock = selection?.rangeCount ? findBlockElement(selection.anchorNode, container) : null;
      restoreLastSelection();
      if (event.shiftKey) {
        document.execCommand("insertLineBreak");
      } else {
        document.execCommand("insertParagraph");
      }
      requestAnimationFrame(() => {
        if (!editorRef.current) return;
        ensureParagraph(editorRef.current);
        if (!event.shiftKey) {
          const postSelection = window.getSelection();
          const postBlock = postSelection?.rangeCount
            ? findBlockElement(postSelection.focusNode, editorRef.current)
            : null;
          let targetBlock = postBlock;
          if (!targetBlock || targetBlock === currentBlock) {
            targetBlock = findNextEditableBlock(currentBlock) ?? null;
          }
          if (!targetBlock) {
            targetBlock = insertEmptyBlockAfter(currentBlock, editorRef.current);
          }
          moveCaretToElementStart(targetBlock);
        }
        updateMarkdown();
        refreshToolbarState();
      });
    };
    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, moveCaretToElementStart, moveCaretToEnd, refreshToolbarState, restoreLastSelection, updateMarkdown]);

  const exec = useCallback(
    (command: string, value?: string) => {
      if (!editorRef.current || mode !== "rich") return;
      restoreLastSelection();
      document.execCommand(command, false, value ?? undefined);
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        lastSelectionRef.current = selection.getRangeAt(0).cloneRange();
      }
      refreshToolbarState();
      updateMarkdown();
    },
    [mode, refreshToolbarState, restoreLastSelection, updateMarkdown]
  );

  const setHeading = useCallback((level: number) => {
    if (level === 0) {
      exec("formatBlock", "P");
    } else {
      exec("formatBlock", `H${level}`);
    }
  }, [exec]);

  const insertLink = useCallback(() => {
    if (!editorRef.current || mode !== "rich") return;
    restoreLastSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const url = window.prompt("Enter the link URL", "https://");
    if (!url) return;
    exec("createLink", url);
  }, [exec, mode, restoreLastSelection]);

  const removeLink = useCallback(() => {
    if (mode !== "rich") return;
    restoreLastSelection();
    exec("unlink");
  }, [exec, mode, restoreLastSelection]);

  const insertTable = useCallback(() => {
    if (!editorRef.current) return;
    const tableHtml =
      '<table class="editor-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table><p><br /></p>';
    exec("insertHTML", tableHtml);
  }, [exec]);

  const tableContext = useMemo(() => {
    if (!activeTableCell) return null;
    const row = activeTableCell.parentElement as HTMLTableRowElement | null;
    const table = row?.closest("table");
    if (!table || !row) return null;
    const rows = Array.from(table.querySelectorAll("tr"));
    const rowIndex = rows.indexOf(row);
    const cells = Array.from(row.querySelectorAll("th,td"));
    const colIndex = cells.indexOf(activeTableCell);
    return { table, row, rowIndex, colIndex, rows };
  }, [activeTableCell]);

  const insertTableRow = useCallback(
    (position: "above" | "below") => {
      if (!tableContext) return;
      const { table, row, rowIndex } = tableContext;
      const cells = Array.from(row.querySelectorAll("th,td"));
      const newRow = document.createElement("tr");
      cells.forEach((cell) => {
        const newCell = document.createElement(cell.tagName.toLowerCase());
        newCell.innerHTML = "<br />";
        newRow.appendChild(newCell);
      });
      const body = row.parentElement;
      if (!body) return;
      if (position === "below") {
        body.insertBefore(newRow, row.nextSibling);
      } else {
        body.insertBefore(newRow, row);
      }
      const range = document.createRange();
      range.selectNodeContents(newRow.cells[0] || newRow);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      updateMarkdown();
    },
    [tableContext, updateMarkdown]
  );

  const insertTableColumn = useCallback(
    (position: "left" | "right") => {
      if (!tableContext) return;
      const { table, colIndex } = tableContext;
      const rows = Array.from(table.querySelectorAll("tr"));
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("th,td"));
        const targetIndex = position === "right" ? colIndex + 1 : colIndex;
        const tagName = cells[colIndex]?.tagName.toLowerCase() || "td";
        const newCell = document.createElement(tagName);
        newCell.innerHTML = "<br />";
        if (targetIndex >= cells.length) {
          row.appendChild(newCell);
        } else {
          row.insertBefore(newCell, cells[targetIndex]);
        }
      });
      const firstRow = rows[tableContext.rowIndex];
      const newCell = firstRow?.querySelectorAll("th,td")[position === "right" ? colIndex + 1 : colIndex];
      if (newCell) {
        const range = document.createRange();
        range.selectNodeContents(newCell);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      updateMarkdown();
    },
    [tableContext, updateMarkdown]
  );

  const removeTableRow = useCallback(() => {
    if (!tableContext) return;
    const { row, table } = tableContext;
    const body = row.parentElement;
    if (!body) return;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length <= 1) {
      table.remove();
    } else {
      row.remove();
    }
    updateMarkdown();
  }, [tableContext, updateMarkdown]);

  const removeTableColumn = useCallback(() => {
    if (!tableContext) return;
    const { table, colIndex } = tableContext;
    const rows = Array.from(table.querySelectorAll("tr"));
    const columnCount = rows[0]?.querySelectorAll("th,td").length ?? 0;
    if (columnCount <= 1) {
      table.remove();
      updateMarkdown();
      return;
    }
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("th,td"));
      const target = cells[colIndex];
      if (target) target.remove();
    });
    updateMarkdown();
  }, [tableContext, updateMarkdown]);

  const handleToolbarMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      restoreLastSelection();
    },
    [restoreLastSelection]
  );

  const cancelHideLinkPreview = useCallback(() => {
    if (hideLinkPreviewTimeoutRef.current !== null) {
      window.clearTimeout(hideLinkPreviewTimeoutRef.current);
      hideLinkPreviewTimeoutRef.current = null;
    }
  }, []);

  const scheduleHideLinkPreview = useCallback(() => {
    cancelHideLinkPreview();
    hideLinkPreviewTimeoutRef.current = window.setTimeout(() => {
      hoveredLinkRef.current = null;
      setLinkPreview(null);
    }, 160);
  }, [cancelHideLinkPreview]);

  const updateLinkPreviewPosition = useCallback(() => {
    const element = hoveredLinkRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setLinkPreview({
      href: element.getAttribute("href") ?? "",
      top: rect.bottom + LINK_TOOLTIP_OFFSET,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const handleEditHoveredLink = useCallback(() => {
    if (mode !== "rich") return;
    const element = hoveredLinkRef.current;
    if (!element) return;
    restoreLastSelection();
    const current = element.getAttribute("href") ?? "";
    const next = window.prompt("Update link URL", current) ?? undefined;
    if (next === undefined) return;
    const normalized = next.trim();
    if (normalized) {
      element.setAttribute("href", normalized);
    } else {
      element.removeAttribute("href");
    }
    updateLinkPreviewPosition();
    updateMarkdown();
  }, [mode, restoreLastSelection, updateLinkPreviewPosition, updateMarkdown]);

  useEffect(() => {
    if (mode === "markdown") {
      cancelHideLinkPreview();
      setActivePlaceholder(null);
      hoveredLinkRef.current = null;
      setLinkPreview(null);
      lastSelectionRef.current = null;
    }
  }, [cancelHideLinkPreview, mode]);

  useEffect(() => {
    if (!editorRef.current || mode !== "rich") return;
    const container = editorRef.current;
    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor || !container.contains(anchor)) return;
      hoveredLinkRef.current = anchor as HTMLAnchorElement;
      cancelHideLinkPreview();
      updateLinkPreviewPosition();
    };
    const handlePointerOut = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor || !container.contains(anchor)) return;
      const related = event.relatedTarget as HTMLElement | null;
      if (related) {
        if (anchor.contains(related)) return;
        if (related.closest(".rich-link-tooltip")) {
          cancelHideLinkPreview();
          return;
        }
      }
      if (hoveredLinkRef.current === anchor) {
        scheduleHideLinkPreview();
      }
    };
    const handlePointerLeave = () => {
      scheduleHideLinkPreview();
    };
    container.addEventListener("pointerover", handlePointerOver);
    container.addEventListener("pointerout", handlePointerOut);
    container.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      container.removeEventListener("pointerover", handlePointerOver);
      container.removeEventListener("pointerout", handlePointerOut);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [cancelHideLinkPreview, mode, scheduleHideLinkPreview, updateLinkPreviewPosition]);

  useEffect(() => {
    if (mode !== "rich") return;
    const handleReposition = () => updateLinkPreviewPosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [mode, updateLinkPreviewPosition]);

  const insertPlaceholder = useCallback(
    (definition: PlaceholderDefinition) => {
      if (!editorRef.current || mode !== "rich") return;
      restoreLastSelection();
      const { key, defaultLabel } = definition;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      const currentLabel = selectedText.trim() || defaultLabel;
      const placeholderElement = document.createElement("span");
      placeholderElement.className = PLACEHOLDER_CLASS;
      placeholderElement.dataset.placeholderKey = key;
      placeholderElement.dataset.placeholderLabel = currentLabel;
      placeholderElement.contentEditable = "false";
      placeholderElement.textContent = currentLabel;
      range.deleteContents();
      range.insertNode(placeholderElement);
      selection.removeAllRanges();
      const after = document.createRange();
      after.setStartAfter(placeholderElement);
      after.collapse(true);
      selection.addRange(after);
      lastSelectionRef.current = after.cloneRange();
      updateMarkdown();
      refreshToolbarState();
    },
    [mode, refreshToolbarState, restoreLastSelection, updateMarkdown]
  );

  const editActivePlaceholder = useCallback(() => {
    if (!activePlaceholder) return;
    const current = activePlaceholder.dataset.placeholderLabel ?? activePlaceholder.textContent ?? "";
    const next = window.prompt("Update placeholder label", current ?? "");
    if (next === null) return;
    const label = next.trim();
    if (!label) return;
    activePlaceholder.dataset.placeholderLabel = label;
    activePlaceholder.textContent = label;
    updateMarkdown();
  }, [activePlaceholder, updateMarkdown]);

  const removeActivePlaceholder = useCallback(() => {
    if (!activePlaceholder) return;
    activePlaceholder.remove();
    updateMarkdown();
    refreshToolbarState();
  }, [activePlaceholder, refreshToolbarState, updateMarkdown]);

  useEffect(() => {
    if (!editorRef.current) return;
    const container = editorRef.current;
    const handleInput = () => {
      if (isSettingContentRef.current) return;
      updateMarkdown();
    };
    const handleBlur = () => {
      ensureParagraph(container);
      updateEmptyState(container);
    };
    container.addEventListener("input", handleInput);
    container.addEventListener("blur", handleBlur);
    return () => {
      container.removeEventListener("input", handleInput);
      container.removeEventListener("blur", handleBlur);
    };
  }, [updateMarkdown]);

  const toolbarButtonClass = useMemo(
    () =>
      "inline-flex h-7 items-center justify-center rounded-md bg-transparent px-2 text-[11px] font-semibold text-muted/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    []
  );

  const heightValue = Math.max(height ?? 420, 320);
  const toolbarWrapperClass = hasToolbarContext
    ? "flex w-full flex-col gap-2"
    : "sticky top-0 z-30 -mx-4 mb-6 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur md:-mx-5 md:px-5";
  const handleEditorFocus = useCallback(() => {
    toolbarContext?.setActiveId(editorId);
  }, [editorId, toolbarContext]);

  const toolbarContent = (
    <div className={toolbarWrapperClass}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted/70">
          <span className="uppercase tracking-[0.2em] text-muted/70">{label}</span>
          {mode === "rich" && activePlaceholder ? (
            <div className="flex items-center gap-2 rounded-full bg-surface/50 px-2 py-1 text-[10px] font-semibold text-muted/70">
              <span>Placeholder</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
                {activePlaceholder.dataset.placeholderKey}
              </span>
              <button type="button" className="text-accent transition hover:text-foreground" onClick={editActivePlaceholder}>
                Edit
              </button>
              <button type="button" className="text-destructive/80 transition hover:text-destructive" onClick={removeActivePlaceholder}>
                Remove
              </button>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-surface/50 p-1 text-[11px] font-semibold text-muted/70">
          <button
            type="button"
            className={clsx(
              "rounded-full px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              mode === "rich" ? "bg-foreground/10 text-foreground" : "hover:text-foreground"
            )}
            onClick={() => setMode("rich")}
          >
            Visual
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-full px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              mode === "markdown" ? "bg-foreground/10 text-foreground" : "hover:text-foreground"
            )}
            onClick={() => setMode("markdown")}
          >
            Markdown
          </button>
        </div>
      </div>

      {mode === "rich" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.bold ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("bold")}
                title="Bold"
              >
                B
              </button>
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.italic ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("italic")}
                title="Italic"
              >
                <span className="italic">I</span>
              </button>
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.underline ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("underline")}
                title="Underline"
              >
                <span className="underline">U</span>
              </button>
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.blockquote ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("formatBlock", "BLOCKQUOTE")}
                title="Block quote"
              >
                “ ”
              </button>
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.code ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("formatBlock", "PRE")}
                title="Code block"
              >
                {"</>"}
              </button>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${toolbarButtonClass} ${formatState.activeHeading === `h${level}` ? "bg-foreground/10 text-foreground" : ""}`}
                  onMouseDown={handleToolbarMouseDown}
                  onClick={() => setHeading(level)}
                  title={`Heading ${level}`}
                >
                  H{level}
                </button>
              ))}
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.activeHeading === "p" ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => setHeading(0)}
                title="Paragraph"
              >
                P
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.bulletList ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("insertUnorderedList")}
                title="Bulleted list"
              >
                • • •
              </button>
              <button
                type="button"
                className={`${toolbarButtonClass} ${formatState.orderedList ? "bg-foreground/10 text-foreground" : ""}`}
                onMouseDown={handleToolbarMouseDown}
                onClick={() => exec("insertOrderedList")}
                title="Numbered list"
              >
                1 2 3
              </button>
            </div>
            <div ref={moreMenuRef} className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-surface/50 px-3 py-1 text-[11px] font-semibold text-foreground/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                onMouseDown={handleToolbarMouseDown}
                onClick={() => setShowMoreMenu((prev) => !prev)}
              >
                More
                <span className="text-[10px]">▾</span>
              </button>
              {showMoreMenu ? (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-surface/95 p-2 text-xs shadow-soft">
                  <div className="space-y-1">
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground/80 transition hover:bg-surface-muted/60 hover:text-foreground"
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertLink();
                        setShowMoreMenu(false);
                      }}
                    >
                      Insert link
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground/80 transition hover:bg-surface-muted/60 hover:text-foreground"
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        removeLink();
                        setShowMoreMenu(false);
                      }}
                    >
                      Remove link
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground/80 transition hover:bg-surface-muted/60 hover:text-foreground"
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertTable();
                        setShowMoreMenu(false);
                      }}
                    >
                      Insert table
                    </button>
                  </div>

                  <div className="my-2 h-px bg-border/40" />

                  <div className="space-y-1">
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertTableRow("above");
                        setShowMoreMenu(false);
                      }}
                    >
                      Table row above
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertTableRow("below");
                        setShowMoreMenu(false);
                      }}
                    >
                      Table row below
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertTableColumn("left");
                        setShowMoreMenu(false);
                      }}
                    >
                      Table column left
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        insertTableColumn("right");
                        setShowMoreMenu(false);
                      }}
                    >
                      Table column right
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        removeTableRow();
                        setShowMoreMenu(false);
                      }}
                    >
                      Delete table row
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-surface-muted/60",
                        tableContext ? "text-foreground/80" : "text-muted/50"
                      )}
                      disabled={!tableContext}
                      onMouseDown={handleToolbarMouseDown}
                      onClick={() => {
                        removeTableColumn();
                        setShowMoreMenu(false);
                      }}
                    >
                      Delete table column
                    </button>
                  </div>

                  <div className="my-2 h-px bg-border/40" />

                  <div className="grid gap-1">
                    {PLACEHOLDER_DEFINITIONS.map((definition) => (
                      <button
                        key={definition.key}
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground/80 transition hover:bg-surface-muted/60 hover:text-foreground"
                        onMouseDown={handleToolbarMouseDown}
                        onClick={() => {
                          insertPlaceholder(definition);
                          setShowMoreMenu(false);
                        }}
                      >
                        {definition.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted/70">
            <span className="rounded-full bg-surface/50 px-2 py-0.5">Shift+Enter for soft break</span>
            <span className="rounded-full bg-surface/50 px-2 py-0.5">Drag images to gallery uploader</span>
          </div>
        </div>
      ) : null}
    </div>
  );

  const toolbarNode =
    toolbarHost && toolbarContext && isToolbarActive ? createPortal(toolbarContent, toolbarHost) : toolbarContent;
  const shouldRenderToolbar = !hasToolbarContext || isToolbarActive;

  return (
    <>
      {shouldRenderToolbar ? toolbarNode : null}
      <div className="relative" data-placeholder-enhanced="true">
        <div
          ref={editorRef}
          className="rich-editor-area"
          contentEditable={mode === "rich"}
          suppressContentEditableWarning
          spellCheck={mode === "rich"}
          onFocus={handleEditorFocus}
          data-placeholder={placeholder ?? "Write your content…"}
          style={{
            minHeight: heightValue,
            display: mode === "markdown" ? "none" : undefined
          } as CSSProperties}
        />
        {mode === "markdown" ? (
          <textarea
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value)}
            spellCheck
            onFocus={handleEditorFocus}
            className="w-full resize-vertical border-0 bg-transparent px-6 py-5 text-lg text-foreground outline-none focus-visible:ring-0"
            style={{ minHeight: heightValue } as CSSProperties}
            placeholder={placeholder ?? "Write your content…"}
          />
        ) : null}
      </div>

      {mode === "rich" && linkPreview ? (
        <div
          className="rich-link-tooltip fixed z-50 flex max-w-xs -translate-x-1/2 flex-col gap-2 rounded-xl bg-background/95 p-3 text-xs text-muted shadow-lg backdrop-blur"
          style={{ top: linkPreview.top, left: linkPreview.left }}
          onMouseEnter={cancelHideLinkPreview}
          onMouseLeave={scheduleHideLinkPreview}
        >
          <span className="max-w-[18rem] break-words text-foreground">
            {linkPreview.href || "No link set"}
          </span>
          <button
            type="button"
            className="self-start rounded-md bg-surface/60 px-2 py-1 text-xs font-semibold text-accent transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            onClick={handleEditHoveredLink}
          >
            Edit link
          </button>
        </div>
      ) : null}
      <style jsx global>{`
        .rich-editor-area {
          position: relative;
          width: 100%;
          border-radius: 1.5rem;
          background: transparent;
          padding: 1.75rem 1.5rem 2.5rem;
          outline: none;
          font-size: 1.15rem;
          color: rgb(var(--color-foreground));
          overflow-y: visible;
          line-height: 1.85;
          letter-spacing: 0.005em;
          word-break: break-word;
        }
        .rich-editor-area[data-empty="true"]:before {
          content: attr(data-placeholder);
          position: absolute;
          top: 1.75rem;
          left: 1.5rem;
          color: rgba(var(--color-muted), 0.8);
          pointer-events: none;
        }
        .rich-editor-area p,
        .rich-editor-area div {
          margin: 0 0 1rem 0;
          color: rgb(var(--color-foreground));
        }
        .rich-editor-area h1,
        .rich-editor-area h2,
        .rich-editor-area h3,
        .rich-editor-area h4,
        .rich-editor-area h5,
        .rich-editor-area h6 {
          font-weight: 800;
          color: rgb(var(--color-foreground));
        }
        .rich-editor-area h1 {
          margin: 1.6rem 0 0.75rem;
          font-size: 2.1rem;
          line-height: 1.2;
          letter-spacing: -0.02em;
        }
        .rich-editor-area h2 {
          margin: 1.4rem 0 0.65rem;
          font-size: 1.6rem;
          line-height: 1.28;
          letter-spacing: -0.01em;
        }
        .rich-editor-area h3 {
          margin: 1.2rem 0 0.6rem;
          font-size: 1.35rem;
          line-height: 1.3;
        }
        .rich-editor-area h4 {
          margin: 1rem 0 0.55rem;
          font-size: 1.15rem;
          line-height: 1.35;
        }
        .rich-editor-area h5,
        .rich-editor-area h6 {
          margin: 0.8rem 0 0.45rem;
          font-size: 1.05rem;
          line-height: 1.4;
          letter-spacing: 0.01em;
        }
        .rich-editor-area ul,
        .rich-editor-area ol {
          padding-left: 1.35rem;
          margin: 0.75rem 0 0.9rem;
        }
        .rich-editor-area li + li {
          margin-top: 0.35rem;
        }
        .rich-editor-area ul ul,
        .rich-editor-area ol ol {
          margin-top: 0.35rem;
        }
        .rich-editor-area blockquote {
          padding: 0.9rem 1.25rem;
          color: rgb(var(--color-foreground));
          margin: 1.1rem 0;
          background: rgba(var(--color-surface), 0.5);
          border-radius: 0.9rem;
          font-style: italic;
        }
        .rich-editor-area pre {
          background: rgba(var(--color-surface-muted), 0.5);
          border-radius: 0.85rem;
          padding: 1rem 1.1rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          overflow-x: auto;
          line-height: 1.55;
        }
        .rich-editor-area code {
          background: rgba(var(--color-surface-muted), 0.55);
          border-radius: 0.55rem;
          padding: 0.18rem 0.5rem;
          font-size: 0.95rem;
        }
        .rich-editor-area pre code {
          background: transparent;
          border: none;
          padding: 0;
          font-size: 0.98rem;
        }
        .rich-editor-area hr {
          border: 0;
          height: 1px;
          margin: 1.5rem 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(var(--color-border), 0.8),
            transparent
          );
        }
        .rich-editor-area table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 1.25rem 0;
          border-radius: 0.9rem;
          overflow: hidden;
          background: rgba(var(--color-surface), 0.5);
        }
        .rich-editor-area th,
        .rich-editor-area td {
          padding: 0.75rem 0.85rem;
          text-align: left;
          font-size: 0.98rem;
        }
        .rich-editor-area tr + tr td {
          border-top: 1px solid rgba(var(--color-border), 0.25);
        }
        .rich-editor-area th {
          background: rgba(var(--color-surface-strong), 0.4);
          font-weight: 700;
          color: rgb(var(--color-foreground));
        }
        .rich-editor-area a {
          color: rgb(var(--color-accent));
          text-decoration: underline;
          text-underline-offset: 0.18em;
          text-decoration-thickness: 0.12em;
          font-weight: 600;
        }
        .rich-editor-area a:hover {
          color: rgba(var(--color-accent), 0.95);
          text-decoration-color: rgba(var(--color-accent), 0.95);
        }
        .rich-editor-area .${PLACEHOLDER_CLASS} {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.1rem 0.5rem;
          border-radius: 9999px;
          background: rgba(59, 130, 246, 0.14);
          color: rgb(var(--color-accent));
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          user-select: none;
        }
        .rich-editor-area .${PLACEHOLDER_CLASS}:after {
          content: attr(data-placeholder-key);
          font-size: 0.65em;
          font-weight: 700;
          text-transform: uppercase;
          color: rgba(59, 130, 246, 0.9);
          background: rgba(59, 130, 246, 0.16);
          padding: 0.05rem 0.35rem;
          border-radius: 999px;
          margin-left: 0.35rem;
        }
        .rich-editor-area img {
          max-width: 100%;
          display: block;
          border-radius: 0.9rem;
          margin: 1.1rem 0;
        }
      `}</style>
    </>
  );
}
