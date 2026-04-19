import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
  },
  recCard: {
    marginBottom: 24,
    borderRadius: 12,
  },
  recHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recDesc: {
    marginBottom: 12,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
  },
  browseCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  btn: {
    marginTop: 16,
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 8,
    minHeight: 48,
  },
  skip: {
    marginTop: 8,
  },
});
