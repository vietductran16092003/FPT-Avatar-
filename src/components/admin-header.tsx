import Image from "next/image";

export function AdminHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-7 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-[50px] items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
          <Image
            src="/fpt-logo.webp"
            alt="FPT"
            width={42}
            height={24}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="text-[15px] font-bold">
          Avatar Frame Platform{" "}
          <span className="font-medium text-muted-foreground">· Admin</span>
        </div>
      </div>
    </header>
  );
}
