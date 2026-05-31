import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { exerciseSchema } from "@repo/core/schemas";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ExerciseForm } from "@/components/features/exercises/exercise-form";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

export default function NewExerciseScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const createExercise = useMutation(api.exercises.create);
  const facets = useQuery(api.exercises.listFacets);
  const [saving, setSaving] = useState(false);

  const form = useForm({
    resolver: zodResolver(exerciseSchema) as any,
    defaultValues: {
      name: "",
      description: "",
      category: "",
      equipment: "",
      videoUrl: "",
      muscleGroups: [],
    },
  });

  useUnsavedChangesGuard(form.formState.isDirty && !saving);

  const onSubmit = async (values: any) => {
    setSaving(true);
    try {
      await createExercise({
        name: values.name,
        description: values.description || undefined,
        category: values.category,
        equipment: values.equipment || undefined,
        videoUrl: values.videoUrl || undefined,
        muscleGroups: values.muscleGroups,
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo crear el ejercicio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={styles.saveBtn}
              onPress={() => form.handleSubmit(onSubmit)()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color={isDark ? "#000" : "#fff"}
                />
              ) : (
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: isDark ? "#000" : "#fff", fontSize: 14 }}
                >
                  Guardar
                </ThemedText>
              )}
            </ThemedPressable>
          ),
        }}
      />
      <View style={styles.safe}>
        <ExerciseForm
          form={form}
          categories={facets?.categories ?? []}
          equipmentOptions={facets?.equipment ?? []}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    minHeight: 36,
  },
});
