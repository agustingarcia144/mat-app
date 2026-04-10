export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border/50 bg-background/50 py-6 text-center">
      <p className="text-muted-foreground text-sm">
        © {year} Mat. Todos los derechos reservados.
      </p>
    </footer>
  );
}
