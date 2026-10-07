import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Markdown-Rendering ohne rohes HTML (CSP, XSS): react-markdown rendert
// standardmäßig kein HTML; rehype-raw wird bewusst NICHT eingesetzt.
export function MarkdownView({
	source,
	className,
}: {
	source: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"max-w-none text-[0.95rem] leading-relaxed [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mt-8 [&_h1]:font-serif-display [&_h1]:text-2xl [&_h2]:mt-8 [&_h2]:font-serif-display [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:font-serif-display [&_h3]:text-lg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6",
				className,
			)}
		>
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={{
					a: ({ href, children }) => (
						<a
							href={href}
							rel="noopener nofollow"
							target={href?.startsWith("http") ? "_blank" : undefined}
						>
							{children}
						</a>
					),
				}}
			>
				{source}
			</Markdown>
		</div>
	);
}
