import { optHtml } from '@/lib/optText';
export { optHtml, optPlain } from '@/lib/optText';

/** Besedilo možnosti z dovoljenim oblikovanjem (podčrtano, krepko, ležeče, indeksi) — glej lib/optText. */
export default function OptText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: optHtml(text) }} />;
}
