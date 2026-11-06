import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path)
}

export function isSvgPath(path: string): boolean {
  return /\.svg$/i.test(path)
}

export function isJsonPath(path: string): boolean {
  return /\.(json|jsonc|json5)$/i.test(path)
}

