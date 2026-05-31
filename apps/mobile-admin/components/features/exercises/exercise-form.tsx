import React from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Picker } from "@react-native-picker/picker";

import { ThemedText } from "@/components/ui/themed-text";
import { FacetChip } from "./facet-chip";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type ExerciseFormProps = {
  form: UseFormReturn<any>;
  categories: string[];
  equipmentOptions: string[];
  disabled?: boolean;
};

const COMMON_MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Bíceps",
  "Tríceps",
  "Cuádriceps",
  "Isquiotibiales",
  "Glúteos",
  "Abdominales",
  "Pantorrillas",
  "Antebrazos",
  "Core",
];

export function ExerciseForm({
  form,
  categories,
  equipmentOptions,
  disabled,
}: ExerciseFormProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const inputStyle = [
    styles.input,
    {
      backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
      color: isDark ? "#fff" : "#000",
      borderColor: isDark ? Colors.dark.border : Colors.light.border,
    },
  ];

  const labelStyle = [
    styles.label,
    { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          Nombre *
        </ThemedText>
        <Controller
          control={form.control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={inputStyle}
              value={value}
              onChangeText={onChange}
              placeholder="Nombre del ejercicio"
              placeholderTextColor={
                isDark ? Colors.dark.subtle : Colors.light.subtle
              }
              editable={!disabled}
            />
          )}
        />
        {form.formState.errors.name ? (
          <ThemedText style={styles.error}>
            {form.formState.errors.name.message as string}
          </ThemedText>
        ) : null}
      </View>

      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          Descripción
        </ThemedText>
        <Controller
          control={form.control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={[...inputStyle, styles.multiline]}
              value={value}
              onChangeText={onChange}
              placeholder="Descripción (opcional)"
              placeholderTextColor={
                isDark ? Colors.dark.subtle : Colors.light.subtle
              }
              multiline
              numberOfLines={3}
              editable={!disabled}
            />
          )}
        />
      </View>

      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          Categoría *
        </ThemedText>
        <Controller
          control={form.control}
          name="category"
          render={({ field: { onChange, value } }) => (
            <View
              style={[
                styles.pickerWrapper,
                {
                  backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
            >
              <Picker
                selectedValue={value}
                onValueChange={onChange}
                enabled={!disabled}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Seleccionar categoría..." value="" />
                {categories.map((c) => (
                  <Picker.Item key={c} label={c} value={c} />
                ))}
              </Picker>
            </View>
          )}
        />
        {form.formState.errors.category ? (
          <ThemedText style={styles.error}>
            {form.formState.errors.category.message as string}
          </ThemedText>
        ) : null}
      </View>

      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          Equipamiento
        </ThemedText>
        <Controller
          control={form.control}
          name="equipment"
          render={({ field: { onChange, value } }) => (
            <View
              style={[
                styles.pickerWrapper,
                {
                  backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
            >
              <Picker
                selectedValue={value}
                onValueChange={onChange}
                enabled={!disabled}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Sin equipamiento" value="" />
                {equipmentOptions.map((e) => (
                  <Picker.Item key={e} label={e} value={e} />
                ))}
              </Picker>
            </View>
          )}
        />
      </View>

      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          URL de video
        </ThemedText>
        <Controller
          control={form.control}
          name="videoUrl"
          render={({ field: { onChange, value } }) => (
            <TextInput
              style={inputStyle}
              value={value}
              onChangeText={onChange}
              placeholder="https://youtube.com/..."
              placeholderTextColor={
                isDark ? Colors.dark.subtle : Colors.light.subtle
              }
              autoCapitalize="none"
              keyboardType="url"
              editable={!disabled}
            />
          )}
        />
      </View>

      <View>
        <ThemedText type="defaultSemiBold" style={labelStyle}>
          Grupos musculares
        </ThemedText>
        <Controller
          control={form.control}
          name="muscleGroups"
          render={({ field: { onChange, value } }) => (
            <View style={styles.chipGrid}>
              {COMMON_MUSCLE_GROUPS.map((mg) => (
                <FacetChip
                  key={mg}
                  label={mg}
                  selected={value.includes(mg)}
                  onPress={() => {
                    if (disabled) return;
                    onChange(
                      value.includes(mg)
                        ? value.filter((v: string) => v !== mg)
                        : [...value, mg],
                    );
                  }}
                />
              ))}
            </View>
          )}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  multiline: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  pickerWrapper: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { color: "#ef4444", fontSize: 12, marginTop: 4 },
});
