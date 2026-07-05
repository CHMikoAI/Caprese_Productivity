import TopNav from "@/components/TopNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TopNav />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </>
  );
}
