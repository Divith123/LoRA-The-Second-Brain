import { FC, memo, useState } from "react";
import ReactMarkdown, { Options } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "./ui/button";
import { Check, Copy, Download } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  children: string;
  className?: string;
  language?: string;
}

const CodeBlock: FC<CodeBlockProps> = ({ children, className, language }) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const downloadCode = () => {
    const blob = new Blob([children], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${language || "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group">
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {language || "text"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadCode}
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === "dark" ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 8px 8px",
          fontSize: "14px",
        }}
        showLineNumbers={true}
        wrapLines={true}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

const InlineCode: FC<{ children: string }> = ({ children }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <code
      className="relative px-1.5 py-0.5 bg-muted rounded text-sm font-mono cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={copyToClipboard}
      title="Click to copy"
    >
      {children}
      {copied && (
        <Check className="absolute -top-1 -right-1 h-3 w-3 text-green-500" />
      )}
    </code>
  );
};

const CustomLink: FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({
  href,
  children,
  ...props
}) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  );
};

const CustomHeading: FC<{ level: number; children: React.ReactNode }> = ({
  level,
  children,
}) => {
  const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
  const className = cn(
    "font-semibold tracking-tight",
    level === 1 && "text-2xl mt-6 mb-4",
    level === 2 && "text-xl mt-5 mb-3",
    level === 3 && "text-lg mt-4 mb-2",
    level === 4 && "text-base mt-3 mb-2",
    level === 5 && "text-sm mt-2 mb-1",
    level === 6 && "text-xs mt-2 mb-1"
  );

  return (
    <HeadingTag className={className}>
      {children}
    </HeadingTag>
  );
};

const CustomList: FC<{ ordered?: boolean; children: React.ReactNode }> = ({
  ordered,
  children,
}) => {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <ListTag className={cn("my-4 space-y-2", ordered ? "list-decimal" : "list-disc", "ml-6")}>
      {children}
    </ListTag>
  );
};

const CustomListItem = (props: React.LiHTMLAttributes<HTMLLIElement>) => {
  return <li {...props} className={cn("leading-relaxed", props.className)} />;
};

const CustomImage: FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({
  src,
  alt,
  ...props
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  if (!src || imageError) {
    return (
      <div className="flex items-center justify-center p-4 bg-muted rounded-lg border border-dashed border-muted-foreground/30">
        <div className="text-center">
          <div className="text-2xl mb-2">🖼️</div>
          <p className="text-sm text-muted-foreground">
            {imageError ? "Failed to load image" : "Image"}
          </p>
          {alt && <p className="text-xs text-muted-foreground mt-1">{alt}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="my-4">
      <div className="relative inline-block max-w-full">
        {!imageLoaded && (
          <div className="flex items-center justify-center p-8 bg-muted rounded-lg border">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading image...</p>
            </div>
          </div>
        )}
        <img
          src={src}
          alt={alt}
          {...props}
          className={cn(
            "max-w-full h-auto rounded-lg border shadow-sm",
            !imageLoaded && "hidden",
            props.className
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        {imageLoaded && alt && (
          <p className="text-xs text-muted-foreground mt-2 text-center">{alt}</p>
        )}
      </div>
    </div>
  );
};

const CustomBlockquote = (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => {
  return (
    <blockquote
      {...props}
      className={cn(
        "border-l-4 border-primary pl-4 py-2 my-4 bg-muted/30 rounded-r-lg italic text-muted-foreground",
        props.className
      )}
    />
  );
};

const CustomTable = (props: React.TableHTMLAttributes<HTMLTableElement>) => {
  return (
    <div className="overflow-x-auto my-4">
      <table
        {...props}
        className={cn("w-full border-collapse border border-border rounded-lg", props.className)}
      />
    </div>
  );
};

const CustomTableHead = (props: React.HTMLAttributes<HTMLTableSectionElement>) => {
  return (
    <thead {...props} className={cn("bg-muted/50", props.className)} />
  );
};

const CustomTableCell = ({
  isHeader = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableDataCellElement> & { isHeader?: boolean }) => {
  const CellTag = isHeader ? "th" : "td";
  return (
    <CellTag
      {...props}
      className={cn(
        "border border-border px-4 py-2 text-left",
        isHeader && "font-semibold",
        props.className
      )}
    />
  );
};

export const MemoizedReactMarkdown: FC<Options> = memo(
  (props) => (
    <ReactMarkdown
      {...props}
      components={{
        code: ({ node, className, children, ...props }) => {
          // Type assertion to access 'inline' if present
          const isInline = (props as any).inline;
          const match = /language-(\w+)/.exec(className || "");
          return !isInline && match ? (
            <CodeBlock
              language={match[1]}
              className={className}
            >
              {String(children).replace(/\n$/, "")}
            </CodeBlock>
          ) : (
            <InlineCode>{String(children)}</InlineCode>
          );
        },
        a: CustomLink,
        h1: ({ children }) => <CustomHeading level={1}>{children}</CustomHeading>,
        h2: ({ children }) => <CustomHeading level={2}>{children}</CustomHeading>,
        h3: ({ children }) => <CustomHeading level={3}>{children}</CustomHeading>,
        li: CustomListItem,
        blockquote: CustomBlockquote,
        table: CustomTable,
        thead: CustomTableHead,
        th: ({ children }) => <CustomTableCell isHeader>{children}</CustomTableCell>,
        td: CustomTableCell,
        p: ({ children }) => <p className="leading-relaxed mb-4 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-8 border-border" />,
        img: CustomImage,
      }}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className,
);

MemoizedReactMarkdown.displayName = "MemoizedReactMarkdown";
