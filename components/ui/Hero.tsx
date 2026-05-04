"use client";
import * as React from "react";
import { Container } from "./Container";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { GradientText } from "./GradientText";
import { ArrowRight, Sparkles } from "lucide-react";

export function Hero({
  eyebrow = "New · Modern UI Kit",
  title = "Build delightful products",
  highlight = "faster than ever",
  description = "A modern, accessible, and beautifully crafted design system. Drop it in and ship interfaces your users will love.",
}: {
  eyebrow?: string;
  title?: string;
  highlight?: string;
  description?: string;
}) {
  return (
    <section className="relative pt-16 md:pt-24 pb-16">
      <Container className="text-center">
        <Badge className="mx-auto">
          <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
        </Badge>

        <h1 className="h-display mt-6">
          {title}{" "}
          <GradientText>{highlight}</GradientText>
        </h1>

        <p className="t-lead mx-auto mt-5 max-w-2xl">{description}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Get started — it's free
          </Button>
          <Button size="lg" variant="outline">
            View demo
          </Button>
        </div>

        {/* Decorative product mock */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-[40px] bg-[linear-gradient(120deg,rgba(139,92,246,.25),rgba(217,70,239,.2),rgba(14,165,233,.2))] blur-2xl"
          />
          <div className="glass rounded-3xl p-3 shadow-[var(--shadow-lg)]">
            <div className="rounded-2xl bg-[rgb(var(--surface-2))] aspect-[16/9] grid place-items-center text-[rgb(var(--muted))]">
              <span className="text-sm">Your product preview</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
