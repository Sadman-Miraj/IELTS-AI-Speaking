export const metadata = {
  title: "IELTS Speaking Practice",
  description: "AI-powered IELTS Speaking exam with real examiner voice and band score feedback",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0C1117" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0C1117" }}>
        {children}
      </body>
    </html>
  );
}
