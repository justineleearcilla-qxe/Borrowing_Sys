import { PrismaClient, ItemCondition, ItemStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

const CATEGORIES = [
  {
    name: "Sports Equipment",
    slug: "sports",
    icon: "sports",
    description: "Balls, nets, rackets, jerseys and other athletic gear.",
  },
  {
    name: "Laboratory Equipment",
    slug: "laboratory",
    icon: "laboratory",
    description: "Microscopes, glassware, meters and scientific tools.",
  },
  {
    name: "AV/Multimedia Equipment",
    slug: "av-multimedia",
    icon: "av-multimedia",
    description: "Projectors, cameras, microphones and speakers.",
  },
  {
    name: "Computer/IT Equipment",
    slug: "computer-it",
    icon: "computer-it",
    description: "Laptops, tablets, cables and peripherals.",
  },
  {
    name: "Musical Instruments",
    slug: "musical-instruments",
    icon: "musical-instruments",
    description: "Guitars, keyboards, violins and more.",
  },
  {
    name: "Event/Facility Equipment",
    slug: "event-facility",
    icon: "event-facility",
    description: "Tables, chairs, tents and sound systems.",
  },
];

const ITEMS: Array<{
  code: string;
  name: string;
  categorySlug: string;
  department: string;
  totalQuantity: number;
  availableQuantity: number;
  condition: ItemCondition;
  status: ItemStatus;
  description: string;
}> = [
  {
    code: "EQ-1001",
    name: "Volleyball (Official)",
    categorySlug: "sports",
    department: "Athletics",
    totalQuantity: 12,
    availableQuantity: 12,
    condition: "GOOD",
    status: "AVAILABLE",
    description:
      "Regulation-size indoor volleyball for PE classes and varsity practice.",
  },
  {
    code: "EQ-1002",
    name: "Basketball",
    categorySlug: "sports",
    department: "Athletics",
    totalQuantity: 15,
    availableQuantity: 14,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Standard indoor/outdoor basketball.",
  },
  {
    code: "EQ-1003",
    name: "Badminton Racket Set",
    categorySlug: "sports",
    department: "Athletics",
    totalQuantity: 10,
    availableQuantity: 10,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Set of two rackets with shuttlecocks included.",
  },
  {
    code: "EQ-1004",
    name: "Volleyball Net",
    categorySlug: "sports",
    department: "Athletics",
    totalQuantity: 4,
    availableQuantity: 3,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Tournament net with boundary markers.",
  },
  {
    code: "EQ-2001",
    name: "Compound Microscope",
    categorySlug: "laboratory",
    department: "Biology",
    totalQuantity: 8,
    availableQuantity: 8,
    condition: "GOOD",
    status: "AVAILABLE",
    description:
      "40x-1000x binocular compound microscope with LED illumination.",
  },
  {
    code: "EQ-2002",
    name: "Beaker Set (250ml)",
    categorySlug: "laboratory",
    department: "Chemistry",
    totalQuantity: 30,
    availableQuantity: 28,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Borosilicate glass beakers, set of six.",
  },
  {
    code: "EQ-2003",
    name: "Digital Multimeter",
    categorySlug: "laboratory",
    department: "Engineering",
    totalQuantity: 10,
    availableQuantity: 9,
    condition: "NEW",
    status: "AVAILABLE",
    description: "Auto-ranging digital multimeter with probes.",
  },
  {
    code: "EQ-3001",
    name: "HD Projector",
    categorySlug: "av-multimedia",
    department: "Media Studies",
    totalQuantity: 6,
    availableQuantity: 5,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "1080p projector with HDMI and VGA inputs, includes remote.",
  },
  {
    code: "EQ-3002",
    name: "DSLR Camera",
    categorySlug: "av-multimedia",
    department: "Media Studies",
    totalQuantity: 5,
    availableQuantity: 5,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "24MP DSLR body with 18-55mm kit lens and camera bag.",
  },
  {
    code: "EQ-3003",
    name: "Wireless Microphone",
    categorySlug: "av-multimedia",
    department: "Media Studies",
    totalQuantity: 8,
    availableQuantity: 7,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "UHF wireless lavalier microphone system.",
  },
  {
    code: "EQ-3004",
    name: "Portable PA Speaker",
    categorySlug: "av-multimedia",
    department: "Media Studies",
    totalQuantity: 4,
    availableQuantity: 4,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Battery-powered PA speaker with wireless mic input.",
  },
  {
    code: "EQ-4001",
    name: "Laptop - Dell Latitude",
    categorySlug: "computer-it",
    department: "Computer Science",
    totalQuantity: 20,
    availableQuantity: 18,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "14-inch laptop with charger, preloaded with course software.",
  },
  {
    code: "EQ-4002",
    name: "iPad Tablet",
    categorySlug: "computer-it",
    department: "Computer Science",
    totalQuantity: 15,
    availableQuantity: 15,
    condition: "NEW",
    status: "AVAILABLE",
    description: "10.9-inch iPad with stylus support.",
  },
  {
    code: "EQ-4003",
    name: "HDMI Cable (2m)",
    categorySlug: "computer-it",
    department: "IT Services",
    totalQuantity: 25,
    availableQuantity: 25,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "High-speed HDMI cable, 2 meters.",
  },
  {
    code: "EQ-4004",
    name: "USB-C Docking Station",
    categorySlug: "computer-it",
    department: "IT Services",
    totalQuantity: 10,
    availableQuantity: 8,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Dual-display USB-C dock with power delivery.",
  },
  {
    code: "EQ-5001",
    name: "Acoustic Guitar",
    categorySlug: "musical-instruments",
    department: "Music",
    totalQuantity: 6,
    availableQuantity: 6,
    condition: "GOOD",
    status: "AVAILABLE",
    description:
      "Full-size steel-string acoustic guitar with gig bag and capo.",
  },
  {
    code: "EQ-5002",
    name: "Digital Piano (88-key)",
    categorySlug: "musical-instruments",
    department: "Music",
    totalQuantity: 3,
    availableQuantity: 2,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Weighted 88-key digital piano with sustain pedal.",
  },
  {
    code: "EQ-5003",
    name: "Violin (Full Size)",
    categorySlug: "musical-instruments",
    department: "Music",
    totalQuantity: 5,
    availableQuantity: 5,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Full-size violin outfit with bow, case and rosin.",
  },
  {
    code: "EQ-5004",
    name: "Stage Amplifier (Legacy)",
    categorySlug: "musical-instruments",
    department: "Music",
    totalQuantity: 1,
    availableQuantity: 0,
    condition: "DAMAGED",
    status: "RETIRED",
    description: "Retired unit awaiting disposal. Do not issue.",
  },
  {
    code: "EQ-6001",
    name: "Folding Table",
    categorySlug: "event-facility",
    department: "Facilities",
    totalQuantity: 40,
    availableQuantity: 38,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "6-foot folding table for events and fairs.",
  },
  {
    code: "EQ-6002",
    name: "Stackable Chair",
    categorySlug: "event-facility",
    department: "Facilities",
    totalQuantity: 120,
    availableQuantity: 115,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Plastic stackable chair for assemblies and events.",
  },
  {
    code: "EQ-6003",
    name: "Stage Lighting Kit",
    categorySlug: "event-facility",
    department: "Facilities",
    totalQuantity: 2,
    availableQuantity: 2,
    condition: "GOOD",
    status: "AVAILABLE",
    description: "Four-par can lighting kit with stands and controller.",
  },
  {
    code: "EQ-6004",
    name: "Pop-up Canopy Tent",
    categorySlug: "event-facility",
    department: "Facilities",
    totalQuantity: 6,
    availableQuantity: 0,
    condition: "DAMAGED",
    status: "MAINTENANCE",
    description: "10x10 canopy tent. Under repair after storm damage.",
  },
];

const IMAGE_URLS: Record<string, string> = {
  "EQ-1001": "https://loremflickr.com/900/600/volleyball?lock=1001",
  "EQ-1002":
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=900&q=85",
  "EQ-1003":
    "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=900&q=85",
  "EQ-1004": "https://loremflickr.com/900/600/volleyball,net?lock=1004",
  "EQ-2001": "https://loremflickr.com/900/600/compound,microscope?lock=2001",
  "EQ-2002": "https://loremflickr.com/900/600/laboratory,beaker?lock=2002",
  "EQ-2003":
    "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=900&q=85",
  "EQ-3001":
    "https://images.unsplash.com/photo-1626379953822-baec19c3accd?auto=format&fit=crop&w=900&q=85",
  "EQ-3002":
    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85",
  "EQ-3003":
    "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=85",
  "EQ-3004":
    "https://images.unsplash.com/photo-1545454675-96b9d1e5b2e4?auto=format&fit=crop&w=900&q=85",
  "EQ-4001":
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85",
  "EQ-4002":
    "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=85",
  "EQ-4003": "https://loremflickr.com/900/600/hdmi,cable?lock=4003",
  "EQ-4004":
    "https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=900&q=85",
  "EQ-5001":
    "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=900&q=85",
  "EQ-5002":
    "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=900&q=85",
  "EQ-5003": "https://loremflickr.com/900/600/violin?lock=5003",
  "EQ-5004":
    "https://images.unsplash.com/photo-1460039230329-eb070fc6c77c?auto=format&fit=crop&w=900&q=85",
  "EQ-6001": "https://loremflickr.com/900/600/folding,table?lock=6001",
  "EQ-6002":
    "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=85",
  "EQ-6003":
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=85",
  "EQ-6004":
    "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=85",
};

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@school.edu" },
    update: {
      name: "Avery Admin",
      passwordHash,
      role: "ADMIN",
      department: "IT Services",
    },
    create: {
      name: "Avery Admin",
      email: "admin@school.edu",
      passwordHash,
      role: "ADMIN",
      department: "IT Services",
    },
  });
  const student = await prisma.user.upsert({
    where: { email: "maria.student@school.edu" },
    update: {
      name: "Maria Santos",
      passwordHash,
      role: "STUDENT",
      department: "Computer Science",
    },
    create: {
      name: "Maria Santos",
      email: "maria.student@school.edu",
      passwordHash,
      role: "STUDENT",
      department: "Computer Science",
    },
  });
  const faculty = await prisma.user.upsert({
    where: { email: "david.faculty@school.edu" },
    update: {
      name: "Dr. David Cruz",
      passwordHash,
      role: "FACULTY",
      department: "Biology",
      penaltyPoints: 2,
    },
    create: {
      name: "Dr. David Cruz",
      email: "david.faculty@school.edu",
      passwordHash,
      role: "FACULTY",
      department: "Biology",
      penaltyPoints: 2,
    },
  });

  const categoriesBySlug = new Map<string, number>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
    categoriesBySlug.set(c.slug, row.id);
  }

  const itemsByCode = new Map<string, number>();
  for (const it of ITEMS) {
    const categoryId = categoriesBySlug.get(it.categorySlug)!;
    const row = await prisma.item.upsert({
      where: { code: it.code },
      update: { imageUrl: IMAGE_URLS[it.code] },
      create: {
        code: it.code,
        name: it.name,
        description: it.description,
        categoryId,
        totalQuantity: it.totalQuantity,
        availableQuantity: it.availableQuantity,
        condition: it.condition,
        status: it.status,
        department: it.department,
        imageUrl: IMAGE_URLS[it.code],
      },
    });
    itemsByCode.set(it.code, row.id);
  }

  if ((await prisma.loan.count()) === 0) {
    await prisma.loan.createMany({
      data: [
        {
          userId: student.id,
          itemId: itemsByCode.get("EQ-1001")!,
          quantity: 1,
          purpose: "Intramural volleyball match",
          dateNeeded: days(-14),
          returnDate: days(-7),
          status: "RETURNED",
          outcome: "OK",
          decidedById: admin.id,
          borrowedAt: days(-14),
          returnedAt: days(-7),
          createdAt: days(-16),
        },
        {
          userId: student.id,
          itemId: itemsByCode.get("EQ-4001")!,
          quantity: 1,
          purpose: "Software engineering capstone project",
          dateNeeded: days(-1),
          returnDate: days(2),
          status: "BORROWED",
          decidedById: admin.id,
          borrowedAt: days(-1),
          createdAt: days(-2),
        },
        {
          userId: faculty.id,
          itemId: itemsByCode.get("EQ-2001")!,
          quantity: 2,
          purpose: "Cell biology laboratory sessions",
          dateNeeded: days(-10),
          returnDate: days(-3),
          status: "OVERDUE",
          remarks:
            "Returned late previously. Please coordinate with the lab technician.",
          decidedById: admin.id,
          borrowedAt: days(-10),
          createdAt: days(-12),
        },
        {
          userId: student.id,
          itemId: itemsByCode.get("EQ-3001")!,
          quantity: 1,
          purpose: "Film class final presentation",
          dateNeeded: days(2),
          returnDate: days(5),
          status: "APPROVED",
          remarks: "Pick up at the media services counter.",
          decidedById: admin.id,
          createdAt: days(-1),
        },
        {
          userId: student.id,
          itemId: itemsByCode.get("EQ-3004")!,
          quantity: 1,
          purpose: "Student club fair booth",
          dateNeeded: days(7),
          returnDate: days(9),
          status: "PENDING",
          createdAt: days(0),
        },
        {
          userId: faculty.id,
          itemId: itemsByCode.get("EQ-5001")!,
          quantity: 1,
          purpose: "Music appreciation lecture demo",
          dateNeeded: days(3),
          returnDate: days(6),
          status: "REJECTED",
          remarks: "Reserved for recital week. Please book after the recital.",
          decidedById: admin.id,
          createdAt: days(-1),
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log("Admin:   admin@school.edu / Password123!");
  console.log("Student: maria.student@school.edu / Password123!");
  console.log("Faculty: david.faculty@school.edu / Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
