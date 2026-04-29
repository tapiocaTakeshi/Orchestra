import Section from "./Section";

export default function Footer() {
  return (
    <footer className="mt-32 border-t border-border py-12">
      <Section className="flex flex-col items-start justify-between gap-6 text-sm text-muted md:flex-row md:items-center">
        <p>© {new Date().getFullYear()} Minimal. All rights reserved.</p>
        <div className="flex gap-6">
          <a href="#" className="transition-opacity hover:opacity-60">
            Twitter
          </a>
          <a href="#" className="transition-opacity hover:opacity-60">
            GitHub
          </a>
          <a href="#" className="transition-opacity hover:opacity-60">
            Email
          </a>
        </div>
      </Section>
    </footer>
  );
}
