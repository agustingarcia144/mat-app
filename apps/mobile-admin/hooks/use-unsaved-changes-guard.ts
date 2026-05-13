import { useEffect } from "react";
import { Alert, BackHandler } from "react-native";
import { useNavigation } from "expo-router";

export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!isDirty) return;

    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      Alert.alert(
        "Descartar cambios?",
        "Tenés cambios sin guardar. ¿Querés descartarlos?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Descartar",
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );

    return () => {
      unsubscribe();
      backHandler.remove();
    };
  }, [isDirty, navigation]);
}
