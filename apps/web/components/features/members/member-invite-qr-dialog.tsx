"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { QrCode, Download, Printer, Copy, RefreshCw } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type InviteData = {
  code: string;
  joinToken: string;
  createdAt: number;
};

const INVITATION_APP_URL =
  process.env.NEXT_PUBLIC_INVITATION_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

export function MemberInviteQrDialog() {
  const getOrCreateCode = useAction(
    api.memberInviteCodes.getOrCreateOrganizationMemberInviteCode,
  );
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const joinUrl = useMemo(() => {
    if (!inviteData || typeof window === "undefined") return null;
    const baseUrl =
      INVITATION_APP_URL && INVITATION_APP_URL.trim().length > 0
        ? INVITATION_APP_URL
        : window.location.origin;
    return `${baseUrl.replace(/\/+$/, "")}/join/${inviteData.joinToken}`;
  }, [inviteData]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getOrCreateCode({});
      setInviteData(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo obtener el código de invitación",
      );
    } finally {
      setIsLoading(false);
    }
  }, [getOrCreateCode]);

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`No se pudo copiar ${label.toLowerCase()}`);
    }
  }, []);

  const downloadQr = useCallback(() => {
    const canvas = document.getElementById(
      "member-join-qr-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error("No se pudo generar la imagen QR");
      return;
    }
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = "mat-member-join-qr.png";
    link.click();
  }, []);

  const printQr = useCallback(() => {
    const canvas = document.getElementById(
      "member-join-qr-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas || !inviteData) {
      toast.error("No se pudo preparar la impresión");
      return;
    }

    const printWindow = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=900,height=700",
    );
    if (!printWindow) {
      toast.error("No se pudo abrir la ventana de impresión");
      return;
    }

    const qrDataUrl = canvas.toDataURL("image/png");
    printWindow.document.write(`
      <html>
        <head>
          <title>QR de ingreso MAT</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; color: #111; }
            .container { display: flex; flex-direction: column; align-items: center; gap: 12px; }
            .code { font-size: 20px; font-weight: 700; letter-spacing: 1px; }
            .muted { color: #555; font-size: 14px; text-align: center; max-width: 560px; }
            img { width: 320px; height: 320px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Escaneá para unirte al gimnasio</h1>
            <img src="${qrDataUrl}" alt="QR de ingreso" />
            <div class="code">Código manual: ${inviteData.code}</div>
            <p class="muted">Si no podés escanear, abrí la app y cargá el código manual.</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [inviteData]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && !inviteData && !isLoading) {
          void loadData();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <QrCode className="size-4" />
          QR de ingreso
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[max(1rem,env(safe-area-inset-top))] max-h-[88vh] w-[min(96vw,32rem)] translate-y-0 overflow-y-auto rounded-lg p-4 pt-8 sm:top-[50%] sm:max-h-none sm:w-full sm:max-w-lg sm:translate-y-[-50%] sm:overflow-visible sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>QR y código de invitación</DialogTitle>
          <DialogDescription>
            Este código es persistente para la organización. Compartilo para que
            nuevos miembros soliciten ingreso.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Cargando código de invitación...
          </div>
        ) : inviteData && joinUrl ? (
          <div className="space-y-4">
            <div className="flex justify-center rounded-lg border p-3 sm:p-4">
              <QRCodeCanvas
                id="member-join-qr-canvas"
                value={joinUrl}
                size={isDesktop ? 260 : 220}
                includeMargin
                className="h-auto max-w-full"
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Código manual
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="break-all font-mono text-base font-semibold">
                  {inviteData.code}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 self-start sm:self-auto"
                  onClick={() => void copyText(inviteData.code, "Código")}
                >
                  <Copy className="size-4" />
                  Copiar
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                URL (web)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="min-w-0 break-all text-xs text-muted-foreground">
                  {joinUrl}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2 self-start sm:self-auto"
                  onClick={() => void copyText(joinUrl, "Link")}
                >
                  <Copy className="size-4" />
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No se pudo cargar el código. Intenta nuevamente.
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 sm:w-auto"
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`size-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Actualizar
          </Button>
          <div className="grid grid-cols-1 gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              onClick={downloadQr}
              disabled={!inviteData || isLoading}
            >
              <Download className="size-4" />
              Descargar
            </Button>
            <Button
              type="button"
              className="w-full gap-2 sm:w-auto"
              onClick={printQr}
              disabled={!inviteData || isLoading}
            >
              <Printer className="size-4" />
              Imprimir
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
