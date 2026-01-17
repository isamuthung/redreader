export const metadata = {
  title: "RedReader",
  description: "RSVP speed reader (PWA) with Supabase sync"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
