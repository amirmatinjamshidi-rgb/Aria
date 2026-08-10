import type {
  CategoryDescriptor,
  ICategoryRegistry,
} from "@aria/contracts";

const DEFAULT_CATEGORIES: readonly CategoryDescriptor[] = [
  { id: "Memory", label: "Memory" },
  { id: "Time", label: "Time" },
  { id: "Search", label: "Search" },
  { id: "Files", label: "Files" },
  { id: "Desktop", label: "Desktop" },
  { id: "Git", label: "Git" },
  { id: "Development", label: "Development" },
  { id: "SmartHome", label: "Smart Home" },
  { id: "Cooking", label: "Cooking" },
  { id: "Media", label: "Media" },
  { id: "Weather", label: "Weather" },
  { id: "Location", label: "Location" },
  { id: "Robot", label: "Robot" },
  { id: "Vision", label: "Vision" },
  { id: "Ocr", label: "OCR" },
  { id: "System", label: "System" },
  { id: "Diagnostics", label: "Diagnostics" },
  { id: "Health", label: "Health" },
  { id: "Shopping", label: "Shopping" },
  { id: "Calendar", label: "Calendar" },
  { id: "Communication", label: "Communication" },
];

export class CategoryRegistry implements ICategoryRegistry {
  private readonly categories = new Map<string, CategoryDescriptor>();

  constructor(seedDefaults = true) {
    if (seedDefaults) {
      for (const cat of DEFAULT_CATEGORIES) {
        this.register(cat);
      }
    }
  }

  register(category: CategoryDescriptor): void {
    this.categories.set(category.id, category);
  }

  list(): readonly CategoryDescriptor[] {
    return [...this.categories.values()];
  }

  get(id: string): CategoryDescriptor | undefined {
    return this.categories.get(id);
  }
}
