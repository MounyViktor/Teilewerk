export type Condition = "neuwertig" | "sehr_gut" | "gut" | "gebraucht" | "defekt";
export type PartStatus = "lager" | "reserviert" | "verkauft";
export type Delivery = "versand" | "abholung";
export type ContractChannel = "chat" | "vor_ort";

export const CONDITION_LABEL: Record<Condition, string> = {
  neuwertig: "Neuwertig (kaum Gebrauchsspuren)",
  sehr_gut: "Sehr gut",
  gut: "Gut (normale Gebrauchsspuren)",
  gebraucht: "Gebraucht (deutliche Spuren)",
  defekt: "Defekt / für Bastler",
};

export const STATUS_LABEL: Record<PartStatus, string> = {
  lager: "Im Lager",
  reserviert: "Reserviert",
  verkauft: "Verkauft",
};

/** Fahrzeugdaten eines Rollers. Der Ankaufspreis ist intern und erscheint weder in Anzeige noch auf der Rechnung. */
export interface Vehicle {
  fin: string;
  plate: string;
  first_registration: string;
  km: string;
  ccm: string;
  power: string;
  keys: string;
  papers: string;
  purchase_date: string;
  purchase_cents: number | null;
}

export interface Part {
  id: number;
  /** Fehlt bei älteren Einträgen: Das sind Teile. */
  kind?: "teil" | "roller";
  vehicle?: Vehicle;
  title: string;
  fits_brand: string;
  fits_model: string;
  part_number: string;
  material: string;
  color: string;
  condition: Condition;
  defects: string;
  description: string;
  price_cents: number;
  storage_location: string;
  status: PartStatus;
  created_at: string;
  updated_at: string;
}

/** Vorschaubild und Metadaten. Das große Bild liegt getrennt in `photo_data`, damit Listen schnell bleiben. */
export interface Photo {
  id: number;
  part_id: number;
  width: number;
  height: number;
  sort_order: number;
  created_at: string;
  thumb: ArrayBuffer;
}

export interface Settings {
  business_name: string;
  owner_name: string;
  street: string;
  zip: string;
  city: string;
  email: string;
  phone: string;
  tax_number: string;
  iban: string;
  bank_name: string;
  bic?: string;
  paypal?: string;
  lucid_number: string;
  invoice_prefix: string;
  /** Laufende Nummer der ersten Rechnung in dieser App. Kann nur geändert werden, solange es keine Rechnung gibt. */
  first_number: string;
}

export const EMPTY_SETTINGS: Settings = {
  business_name: "", owner_name: "", street: "", zip: "", city: "", email: "", phone: "",
  tax_number: "", iban: "", bank_name: "", lucid_number: "", invoice_prefix: "VS", first_number: "8",
};

export interface SaleItem {
  part_id: number | null;
  description: string;
  quantity: number;
  price_cents: number;
}

export interface Sale {
  id: number;
  buyer_name: string;
  buyer_street: string;
  buyer_zip: string;
  buyer_city: string;
  buyer_email: string;
  buyer_platform_name: string;
  delivery: Delivery;
  contract_channel: ContractChannel;
  shipping_cents: number;
  sale_date: string; // YYYY-MM-DD
  warranty_shortened: boolean;
  warranty_informed_at: string | null;
  warranty_agreed_at: string | null;
  warranty_evidence: string;
  notes: string;
  items: SaleItem[];
  created_at: string;
}

export interface Invoice {
  id: number;
  number: string;
  kind: "rechnung" | "storno";
  sale_id: number;
  cancels_invoice_id: number | null;
  issued_at: string;
  total_cents: number;
  snapshot: import("./invoice-pdf").InvoiceSnapshot;
  pdf: ArrayBuffer;
  pdf_sha256: string;
  /** Außerhalb der App erstellt und als PDF übernommen. Hat keinen Verkauf in der App (sale_id = 0). */
  imported?: boolean;
}

/** Dokument zu einem Roller oder Verkauf, zum Beispiel Papiere oder ein Nachweis. `owner` ist "part:3" oder "sale:7". */
export interface Attachment {
  id: number;
  owner: string;
  name: string;
  type: string;
  created_at: string;
  data: ArrayBuffer;
}

export type ExpenseCategory = "werkzeug" | "verbrauch" | "roller" | "teile_neu" | "teile_gebraucht" | "vertrag" | "sonstiges";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  werkzeug: "Werkzeug",
  verbrauch: "Verbrauchsmaterial",
  roller: "Roller",
  teile_neu: "Rollerteile neu",
  teile_gebraucht: "Rollerteile gebraucht",
  vertrag: "Verträge und Versicherungen",
  sonstiges: "Sonstiges",
};

/** Betrag brutto: Als Kleinunternehmer gibt es keinen Vorsteuerabzug. */
export interface Expense {
  id: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  supplier: string;
  description: string;
  total_cents: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export type ContractType = "verkauf" | "ankauf" | "miete" | "versicherung" | "sonstiges";

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  verkauf: "Kaufvertrag (Verkauf)",
  ankauf: "Kaufvertrag (Ankauf)",
  miete: "Mietvertrag",
  versicherung: "Versicherung",
  sonstiges: "Sonstiger Vertrag",
};

export interface Contract {
  id: number;
  type: ContractType;
  title: string;
  partner: string;
  date: string; // YYYY-MM-DD
  ends_on: string; // leer = unbefristet oder erledigt
  /** Kosten pro Monat. Fehlt bei älteren Verträgen und ist keine gebuchte Ausgabe, sie zählt nur zu den monatlichen Kosten. */
  monthly_cents?: number | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity: string;
  entity_id: number | null;
  details: Record<string, unknown>;
}
