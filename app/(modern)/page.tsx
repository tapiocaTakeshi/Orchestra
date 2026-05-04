import "../globals.modern.css";
import { Navbar } from "@/components/ui/Navbar";
import { Hero } from "@/components/ui/Hero";
import { FeatureGrid } from "@/components/ui/FeatureGrid";
import { Footer } from "@/components/ui/Footer";

export default function ModernShowcasePage() {
  return (
    <>
      <Navbar brand="Acme" />
      <main>
        <Hero />
        <FeatureGrid />
      </main>
      <Footer brand="Acme" />
    </>
  );
}
