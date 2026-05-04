import * as React from "react";
import { Container } from "./Container";
import { Card, CardBody, CardTitle } from "./Card";
import { Bolt, Shield, Layers, Wand2, Gauge, Heart } from "lucide-react";

const defaults = [
  { icon: Bolt, title: "Blazing fast", body: "Optimized rendering, zero‑bloat primitives, and instant interactions." },
  { icon: Shield, title: "Accessible by default", body: "Keyboard, focus, contrast, and reduced motion handled out of the box." },
  { icon: Layers, title: "Composable", body: "Small, predictable components that snap together to fit any layout." },
  { icon: Wand2, title: "Themeable", body: "Token‑based theming with light & dark modes built in." },
  { icon: Gauge, title: "Production‑ready", body: "Battle‑tested patterns and sensible defaults from day one." },
  { icon: Heart, title: "Crafted with care", body: "Subtle motion and micro‑interactions that feel just right." },
];

export function FeatureGrid({
  items = defaults,
  title = "Everything you need",
  subtitle = "A focused set of primitives to ship modern interfaces.",
}: {
  items?: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <section id="features" className="py-20 md:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="h-title">{title}</h2>
          <p className="t-lead mt-3">{subtitle}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <Card key={title} interactive>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(139,92,246,.15),rgba(217,70,239,.15))] text-[rgb(var(--accent-1))]">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="mt-5">{title}</CardTitle>
              <CardBody>{body}</CardBody>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
