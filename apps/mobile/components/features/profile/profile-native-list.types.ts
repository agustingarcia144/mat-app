export type ProfileMembershipItem = {
  organizationId: string;
  organizationName: string;
};

export type PlanificationListItem = {
  id: string;
  name: string;
  weeksLabel: string;
  dateRange: string | null;
};

export type ProfileNativeListProps = {
  isDark: boolean;
  backgroundColor: string;
  profile: {
    fullName: string;
    primaryEmail?: string;
    imageUrl?: string;
    initials: string;
  };
  organizations: {
    isLoaded: boolean;
    hasMultipleOrganizations: boolean;
    memberships: ProfileMembershipItem[];
    activeOrgId: string | null;
    switchingOrgId: string | null;
    orgError: string | null;
    onSwitch: (organizationId: string) => void;
  };
  onOpenPlanifications: () => void;
  actions: {
    onEditPersonalInfo: () => void;
    onEditPhysicalInfo: () => void;
    onSignOut: () => void;
    onDeleteAccount: () => void;
  };
};

export type PlanificationsNativeListProps = {
  isDark: boolean;
  backgroundColor: string;
  loading: boolean;
  active: PlanificationListItem[];
  other: PlanificationListItem[];
  onOpen: (assignmentId: string) => void;
};
