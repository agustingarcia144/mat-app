import React from "react";
import { Alert } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "@repo/convex";

import { useAppReset } from "@/components/providers/providers";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { getOrgRoleLabel, isOrgAdminRole } from "@/lib/security/roles";

export type OrganizationForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export function useProfileSettingsData() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { resetApp } = useAppReset();
  const router = useRouter();
  const membership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    {},
  );
  const currentOrganization = useQuery(
    api.organizations.getCurrentOrganization,
    {},
  );
  const updateOrganization = useMutation(
    api.organizations.updateCurrentOrganization,
  );
  const orgSettings = useOrgSettings();

  const [organizationModalOpen, setOrganizationModalOpen] =
    React.useState(false);
  const [organizationForm, setOrganizationForm] =
    React.useState<OrganizationForm>({
      name: "",
      address: "",
      phone: "",
      email: "",
    });
  const [savingOrganization, setSavingOrganization] = React.useState(false);

  React.useEffect(() => {
    if (!currentOrganization || organizationModalOpen) return;
    setOrganizationForm({
      name: currentOrganization.name ?? "",
      address: currentOrganization.address ?? "",
      phone: currentOrganization.phone ?? "",
      email: currentOrganization.email ?? "",
    });
  }, [currentOrganization, organizationModalOpen]);

  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;
  const displayName =
    user?.fullName?.trim() ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    primaryEmail ||
    "—";
  const isAdmin = isOrgAdminRole(membership?.role);

  const openOrganizationModal = () => {
    if (currentOrganization) {
      setOrganizationForm({
        name: currentOrganization.name ?? "",
        address: currentOrganization.address ?? "",
        phone: currentOrganization.phone ?? "",
        email: currentOrganization.email ?? "",
      });
    }
    setOrganizationModalOpen(true);
  };

  const closeOrganizationModal = () => {
    if (!savingOrganization) setOrganizationModalOpen(false);
  };

  const onSaveOrganization = async () => {
    if (!organizationForm.name.trim()) {
      Alert.alert("Nombre requerido", "La organización necesita un nombre.");
      return;
    }

    setSavingOrganization(true);
    try {
      await updateOrganization({
        name: organizationForm.name,
        metadata: {
          address: organizationForm.address,
          phone: organizationForm.phone,
          email: organizationForm.email,
        },
      });
      setOrganizationModalOpen(false);
    } catch {
      Alert.alert("Error", "No se pudo guardar la organización.");
    } finally {
      setSavingOrganization(false);
    }
  };

  const onSwitchOrg = () => {
    resetApp();
    router.replace("/select-organization");
  };

  const onSignOut = async () => {
    await signOut();
  };

  return {
    user,
    router,
    membership,
    currentOrganization,
    orgSettings,
    profile: {
      displayName,
      primaryEmail,
      imageUrl: user?.imageUrl,
      initials: getInitials(displayName),
    },
    organization: {
      name: membership?.organization?.name ?? "Organización",
      roleLabel: getOrgRoleLabel(membership?.role),
      isAdmin,
    },
    organizationEditor: {
      visible: organizationModalOpen,
      form: organizationForm,
      logoUrl: currentOrganization?.logoUrl,
      saving: savingOrganization,
      onChange: setOrganizationForm,
      onClose: closeOrganizationModal,
      onSave: onSaveOrganization,
      onOpen: openOrganizationModal,
    },
    actions: {
      onSwitchOrg,
      onSignOut,
      openSettings: () => router.push("/(tabs)/more/settings" as any),
      openUsers: () => router.push("/(tabs)/more/users" as any),
    },
  };
}

export function moduleStatus(value: boolean | undefined) {
  if (value === undefined) return "—";
  return value !== false ? "Activa" : "Inactiva";
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
