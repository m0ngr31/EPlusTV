import type {FC, ReactNode} from 'hono/jsx';

export interface ILayoutProps {
  children: ReactNode;
}

export const Layout: FC = ({children}: ILayoutProps) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <link rel="icon" type="image/x-icon" href="/favicon.ico"></link>
      <script src="/node_modules/htmx.org/dist/htmx.min.js"></script>
      <script src="/node_modules/htmx-toaster/dist/htmx-toaster.min.js"></script>
      <link rel="stylesheet" href="/node_modules/@picocss/pico/css/pico.min.css" />
      <title>E+TV</title>
    </head>
    <body>{children}</body>
  </html>
);
