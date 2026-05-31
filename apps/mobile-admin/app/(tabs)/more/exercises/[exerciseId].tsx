import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { exerciseSchema } from "@repo/core/schemas";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ExerciseForm } from "@/components/features/exercises/exercise-form";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

export default function EditExerciseScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const exercises = useQuery(api.exercises.getByOrganization);
  const facets = useQuery(api.exercises.listFacets);
  const updateExercise = useMutation(api.exercises.update);
  const removeExercise = useMutation(api.exercises.remove);

  const exercise = exercises?.find((e: any) => e._id === exerciseId);
  const isStandard = exercise?.isStandard === true;
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const form = useForm({
    resolver: zodResolver(exerciseSchema) as any,
    defaultValues: {
      name: "",
      description: "",
      category: "",
      equipment: "",
      videoUrl: "",
      muscleGroups: [] as string[],
    },
  });

  useEffect(() => {
    if (exercise && !initialized) {
      form.reset({
        name: exercise.name ?? "",
        description: exercise.description ?? "",
        category: exercise.category ?? "",
        equipment: exercise.equipment ?? "",
        videoUrl: exercise.videoUrl ?? "",
        muscleGroups: (exercise.muscleGroups ?? []) as string[],
      } as any);
      setInitialized(true);
    }
  }, [exercise, initialized, form]);

  useUnsavedChangesGuard(form.formState.isDirty && !saving);

  const onSubmit = async (values: any) => {
    setSaving(true);
    try {
      await updateExercise({
        id: exerciseId as any,
        name: values.name,
        description: values.description || undefined,
        category: values.category,
        equipment: values.equipment || undefined,
        videoUrl: values.videoUrl || undefined,
        muscleGroups: values.muscleGroups,
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert("Eliminar ejercicio", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeExercise({ id: exerciseId as any });
            router.back();
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  if (!exercise) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: () =>
            !isStandard ? (
              <View style={styles.headerActions}>
                <ThemedPressable onPress={onDelete} style={styles.iconBtn}>
                  <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
                </ThemedPressable>
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
              </View>
            ) : null,
        }}
      />
      <View style={styles.safe}>
        <ExerciseForm
          form={form}
          categories={facets?.categories ?? []}
          equipmentOptions={facets?.equipment ?? []}
          disabled={isStandard}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    minHeight: 36,
  },
});
