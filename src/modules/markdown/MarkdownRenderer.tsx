import { CheckmarkCircle01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type JSX, useState } from "react";

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative my-3 rounded-lg border border-border/70 bg-card overflow-hidden text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30 text-muted-foreground text-[11px]">
        <span>{lang || "plaintext"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
            size={12}
          />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono text-[12px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        nodes.push(
          <CodeBlock
            key={`cb-${i}`}
            code={codeBuffer.join("\n")}
            lang={codeLang}
          />,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <h1
          key={i}
          className="text-xl font-bold mt-4 mb-2 pb-1 border-b border-border/50 text-foreground"
        >
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2
          key={i}
          className="text-lg font-semibold mt-3 mb-1.5 pb-0.5 border-b border-border/30 text-foreground"
        >
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-base font-semibold mt-3 mb-1 text-foreground">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <li key={i} className="ml-4 list-disc text-[13px] leading-relaxed text-foreground/90">
          {line.slice(2)}
        </li>,
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);
    } else {
      nodes.push(
        <p key={i} className="text-[13px] leading-relaxed text-foreground/90 my-1">
          {line}
        </p>,
      );
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    nodes.push(
      <CodeBlock
        key="cb-tail"
        code={codeBuffer.join("\n")}
        lang={codeLang}
      />,
    );
  }

  return <div className="markdown-body select-text space-y-1">{nodes}</div>;
}
