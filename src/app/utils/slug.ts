export const slugify = (text: string): string => {
	return text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric characters except spaces and hyphens
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/-+/g, "-") // Collapse consecutive hyphens
		.replace(/^-+|-+$/g, ""); // Remove leading and trailing hyphens
};
