import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  Alert,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { calculateInterest } from "@repo/core/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function ProofUploadForm() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();

  const generateUploadUrl = useMutation(api.planPayments.generateUploadUrl);
  const uploadProof = useMutation(api.planPayments.uploadProof);
  const currentPayment = useQuery(api.planPayments.getMyCurrentPeriodPayment);

  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const showPicker = () => {
    const options = [
      "Foto de galería",
      "Tomar foto",
      "Documento PDF",
      "Cancelar",
    ];
    const cancelIndex = 3;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        (index) => {
          if (index === 0) pickFromGallery();
          else if (index === 1) takePhoto();
          else if (index === 2) pickDocument();
        },
      );
    } else {
      // Android fallback with Alert
      Alert.alert("Seleccionar archivo", "Elegí cómo subir tu comprobante", [
        { text: "Galería", onPress: pickFromGallery },
        { text: "Cámara", onPress: takePhoto },
        { text: "PDF", onPress: pickDocument },
        { text: "Cancelar", style: "cancel" },
      ]);
    }
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Necesitamos acceso a tu galería.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? "";
      const name = asset.fileName ?? "";
      if (
        mime === "image/heic" ||
        mime === "image/heif" ||
        name.toLowerCase().endsWith(".heic") ||
        name.toLowerCase().endsWith(".heif")
      ) {
        Alert.alert(
          "Formato no compatible",
          "Las imágenes HEIC no son compatibles. Por favor exportá la foto como JPEG desde tu galería.",
        );
        return;
      }
      setSelectedFile({
        uri: asset.uri,
        name: name || "comprobante.jpg",
        type: mime || "image/jpeg",
      });
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Necesitamos acceso a tu cámara.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.fileName ?? "comprobante.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_FILE_SIZE) {
        Alert.alert("Archivo muy grande", "El archivo no debe superar 10MB.");
        return;
      }
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "application/pdf",
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !paymentId) return;

    setUploading(true);
    try {
      // Get upload URL
      const uploadUrl = await generateUploadUrl();

      // Upload the file
      const response = await fetch(selectedFile.uri);
      const blob = await response.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Error al subir el archivo");
      }

      const { storageId } = await uploadResponse.json();

      // Link proof to payment
      await uploadProof({
        paymentId: paymentId as any,
        storageId,
        fileName: selectedFile.name,
        contentType: selectedFile.type,
      });

      Alert.alert(
        "Comprobante enviado",
        "Tu comprobante fue enviado para revisión.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Error al subir comprobante",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <ThemedText type="subtitle">Subir comprobante de pago</ThemedText>
        <ThemedText style={styles.description}>
          Seleccioná una imagen o PDF del comprobante de transferencia bancaria.
        </ThemedText>
        <ThemedText style={styles.disclaimer}>
          El pago se realiza directamente al gimnasio por transferencia
          bancaria, fuera de la aplicación. Esta pantalla solo sirve para enviar
          el comprobante.
        </ThemedText>

        {/* Preview */}
        {selectedFile ? (
          <View
            style={[
              styles.preview,
              { backgroundColor: isDark ? "#1c1c1e" : "#f5f5f5" },
            ]}
          >
            {selectedFile.type.startsWith("image/") ? (
              <Image
                source={{ uri: selectedFile.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.pdfPreview}>
                <Text
                  style={[styles.pdfIcon, { color: isDark ? "#fff" : "#000" }]}
                >
                  PDF
                </Text>
              </View>
            )}
            <Text
              style={[styles.fileName, { color: isDark ? "#ccc" : "#444" }]}
              numberOfLines={1}
            >
              {selectedFile.name}
            </Text>
          </View>
        ) : null}

        {/* Interest preview */}
        {currentPayment?.planInterestTiers?.length
          ? (() => {
              const interest = calculateInterest(
                currentPayment.amountArs,
                currentPayment.planInterestTiers,
                currentPayment.billingPeriod,
                currentPayment.planPaymentWindowEndDay,
              );
              return (
                <View
                  style={[
                    interestStyles.box,
                    { backgroundColor: isDark ? "#2a1f00" : "#fef3c7" },
                  ]}
                >
                  <Text
                    style={[
                      interestStyles.title,
                      { color: isDark ? "#fcd34d" : "#92400e" },
                    ]}
                  >
                    Cargo por mora
                  </Text>
                  {interest.applied.length === 0 ? (
                    <Text
                      style={[
                        interestStyles.line,
                        { color: isDark ? "#fcd34d" : "#92400e" },
                      ]}
                    >
                      Sin mora — estás dentro del período de pago.
                    </Text>
                  ) : (
                    <>
                      <Text
                        style={[
                          interestStyles.line,
                          { color: isDark ? "#fcd34d" : "#92400e" },
                        ]}
                      >
                        Base: $
                        {currentPayment.amountArs.toLocaleString("es-AR")}
                      </Text>
                      {interest.applied.map((tier, i) => (
                        <Text
                          key={i}
                          style={[
                            interestStyles.line,
                            { color: isDark ? "#fcd34d" : "#92400e" },
                          ]}
                        >
                          + Mora (
                          {tier.type === "percentage"
                            ? `${tier.value}%`
                            : `$${tier.value.toLocaleString("es-AR")} fijo`}
                          ): +${tier.amountArs.toLocaleString("es-AR")}
                        </Text>
                      ))}
                      <Text
                        style={[
                          interestStyles.total,
                          { color: isDark ? "#fbbf24" : "#78350f" },
                        ]}
                      >
                        Total a pagar: $
                        {interest.totalAmount.toLocaleString("es-AR")}
                      </Text>
                    </>
                  )}
                </View>
              );
            })()
          : null}

        {/* Select file */}
        <ThemedPressable
          type="secondary"
          style={styles.selectButton}
          onPress={showPicker}
          disabled={uploading}
        >
          <Text
            style={[styles.selectText, { color: isDark ? "#fff" : "#000" }]}
          >
            {selectedFile ? "Cambiar archivo" : "Seleccionar archivo"}
          </Text>
        </ThemedPressable>

        {/* Upload */}
        {selectedFile ? (
          <ThemedPressable
            type="primary"
            style={styles.uploadButton}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.uploadText}>Enviar comprobante</Text>
            )}
          </ThemedPressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

const interestStyles = StyleSheet.create({
  box: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  line: {
    fontSize: 13,
  },
  total: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 16,
  },
  description: {
    fontSize: 15,
    opacity: 0.6,
  },
  disclaimer: {
    fontSize: 12,
    opacity: 0.45,
    fontStyle: "italic",
  },
  preview: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
  },
  pdfPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },
  pdfIcon: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  fileName: {
    fontSize: 13,
  },
  selectButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  selectText: {
    fontSize: 16,
    fontWeight: "600",
  },
  uploadButton: {
    marginTop: 4,
  },
  uploadText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
