export function normalizeChallengeGoalOptions(options) {
  return (options || [])
    .map((option) => {
      const label =
        typeof option === "number" || typeof option === "string"
          ? String(option).trim()
          : String(option?.label || option?.value || "").trim();
      if (!label) return null;

      const id =
        typeof option === "object" && option?.id
          ? String(option.id).trim()
          : `target:${label}`;
      return {
        id: id || `target:${label}`,
        label,
      };
    })
    .filter(Boolean)
    .filter((option, index, options) =>
      options.findIndex((candidate) => candidate.label === option.label) === index
    );
}

export function addChallengeGoalOption(options, label) {
  const nextLabel = String(label || "").trim();
  if (!nextLabel) return normalizeChallengeGoalOptions(options);
  return normalizeChallengeGoalOptions([
    ...normalizeChallengeGoalOptions(options),
    { id: `target:${Date.now()}:${nextLabel}`, label: nextLabel },
  ]);
}

export function removeChallengeGoalOption(options, id) {
  const removeId = String(id || "");
  return normalizeChallengeGoalOptions(options).filter((option) => option.id !== removeId);
}

export function getChallengeTitle(selectedLabel, typedTitle) {
  const selected = String(selectedLabel || "").trim();
  const typed = String(typedTitle || "").trim();
  if (selected && typed) return `{${selected}}(${typed})`;
  if (selected) return `{${selected}}`;
  return typed;
}
