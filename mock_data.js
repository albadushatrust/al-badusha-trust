/**
 * AL BADUSHA TRUST - DEFAULT DATA
 * Simple: Donations (money in) and Expenses (money out)
 */

window.DEFAULT_USERS = [
    { username: 'admin',   password: 'admin123',  role: 'admin',  protected: true },
    { username: 'badusha', password: 'trust2025', role: 'admin',  protected: false },
    { username: 'viewer',  password: 'view2025',  role: 'viewer', protected: false }
];

window.DEFAULT_SETTINGS = {
    trustName: "AL BADUSHA TRUST",
    address: "No. 45, Golden Plaza, Nagore - 611002, Tamil Nadu, India",
    email: "contact@albadushatrust.org",
    phone: "+91 94432 18765",
    pan: "AABTA4892C",
    regNumber: "12A/URN/2023-24/TN/18928",
    managingTrustee: "Syed Al Badusha",
    trustees: ["Syed Al Badusha", "H. A. K. Badusha", "M. S. Al Badusha"],
    financialYear: "2025-26",
    bankName: "",
    bankAccount: "",
    ifsc: "",
    taxNote: "Donations are eligible for tax exemption under Section 80G.",
    lowBalanceAlert: 5000,
    language: "en",
    theme: "light",
    lastBackupDate: null
};

window.DEFAULT_DONATIONS = [
    {
        id: "REC-001",
        date: "2025-04-12",
        donorName: "Aarav Sharma",
        donorPhone: "9876543210",
        donorAddress: "Flat 102, Shanti Vihar, Chennai - 600004",
        amount: 25000,
        mode: "Bank Transfer",
        purpose: "Education",
        notes: "For school books and uniforms"
    },
    {
        id: "REC-002",
        date: "2025-06-18",
        donorName: "Priya Patel",
        donorPhone: "8765432109",
        donorAddress: "22, Gandhi Nagar, Nagore - 611002",
        amount: 50000,
        mode: "Bank Transfer",
        purpose: "Education",
        notes: "Annual scholarship fund"
    },
    {
        id: "REC-003",
        date: "2025-08-05",
        donorName: "Syed Abdul Rahman",
        donorPhone: "9988776655",
        donorAddress: "15, Mosque Street, Nagore - 611002",
        amount: 500000,
        mode: "Bank Transfer",
        purpose: "Infrastructure",
        notes: "Building construction fund"
    },
    {
        id: "REC-004",
        date: "2025-10-22",
        donorName: "Ananya Iyer",
        donorPhone: "7654321098",
        donorAddress: "8, Temple Road, Madurai - 625001",
        amount: 15000,
        mode: "Cash",
        purpose: "Medical",
        notes: "Free medical camp support"
    },
    {
        id: "REC-005",
        date: "2025-12-05",
        donorName: "Mohammed Farooq",
        donorPhone: "9345678901",
        donorAddress: "33, Big Bazaar Street, Nagore - 611002",
        amount: 120000,
        mode: "Bank Transfer",
        purpose: "Education",
        notes: "Computer lab equipment"
    },
    {
        id: "REC-006",
        date: "2026-01-15",
        donorName: "Lakshmi Devi",
        donorPhone: "8899001122",
        donorAddress: "12, Anna Nagar, Nagore - 611002",
        amount: 10000,
        mode: "Cash",
        purpose: "Food",
        notes: "Monthly food donation"
    },
    {
        id: "REC-007",
        date: "2026-03-10",
        donorName: "Ramesh Kumar",
        donorPhone: "7788990011",
        donorAddress: "5, New Colony, Nagore - 611002",
        amount: 30000,
        mode: "Bank Transfer",
        purpose: "Medical",
        notes: "Eye camp sponsorship"
    }
];

window.DEFAULT_EXPENSES = [
    {
        id: "EXP-001",
        date: "2025-05-10",
        description: "School books & notebooks for 50 students",
        category: "Education",
        amount: 35000,
        paidTo: "Sri Saraswathi Book Store"
    },
    {
        id: "EXP-002",
        date: "2025-07-20",
        description: "School uniforms for 40 children",
        category: "Education",
        amount: 48000,
        paidTo: "Textile World Nagore"
    },
    {
        id: "EXP-003",
        date: "2025-09-15",
        description: "Free medical camp - medicines & doctor fees",
        category: "Medical",
        amount: 62000,
        paidTo: "City Hospital Nagore"
    },
    {
        id: "EXP-004",
        date: "2025-10-01",
        description: "Monthly food distribution - 200 families",
        category: "Food",
        amount: 40000,
        paidTo: "Fresh Mart Wholesale"
    },
    {
        id: "EXP-005",
        date: "2025-11-15",
        description: "Computer lab - 10 desktop computers",
        category: "Education",
        amount: 250000,
        paidTo: "Tech Solutions India"
    },
    {
        id: "EXP-006",
        date: "2026-01-10",
        description: "Building renovation - classroom repair",
        category: "Infrastructure",
        amount: 180000,
        paidTo: "Al Badusha Construction"
    },
    {
        id: "EXP-007",
        date: "2026-02-20",
        description: "Eye checkup camp for 150 people",
        category: "Medical",
        amount: 45000,
        paidTo: "Vision Care Hospital"
    },
    {
        id: "EXP-008",
        date: "2026-03-01",
        description: "Ramadan food packets - 300 families",
        category: "Food",
        amount: 75000,
        paidTo: "Catering Services"
    }
];
