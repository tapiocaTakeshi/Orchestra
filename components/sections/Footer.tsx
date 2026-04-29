import Container from "@/components/ui/Container";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[hsl(var(--border))]">
      <Container className="py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <p className="text-sm text-[hsl(var(--muted))]">
            © {new Date().getFullYear()} Minimal. All rights reserved.
          </p>
          <ul className="flex items-center gap-6 text-sm text-[hsl(var(--muted))]">
            <li>
              <Link href="#" className="hover:text-[hsl(var(--foreground))] transition-colors">
                Twitter
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-[hsl(var(--foreground))] transition-colors">
                GitHub
              </Link>
            </li>
            <li>
              <Link href="#" className="hover:text-[hsl(var(--foreground))] transition-colors">
                Contact
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
