import { PageHeader } from '@/components/primitives';
export default function Page() {
  return (
    <div>
      <PageHeader title="Ophthalmology — First-Class Module" description="First-class eye care: history, visual function, refraction, external, pupil, motility, slit-lamp, IOP, gonioscopy, fundus, retina, glaucoma, cataract, DR, imaging, surgery, prescriptions." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="panel p-5">
          <h3 className="font-semibold">Examination Components</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-muted list-disc pl-5">
            <li>Patient History (ocular, systemic, family, medication, trauma)</li>
            <li>Visual Acuity (unaided, aided, pinhole, near, BCVA, color, contrast)</li>
            <li>Refraction (sphere, cylinder, axis, prism, add, subjective/objective)</li>
            <li>External, Pupil, Ocular Motility, Binocular Vision</li>
            <li>Slit-Lamp, IOP (Goldmann/NCT/Tonopen/iCare), Gonioscopy</li>
            <li>Fundus: retina, macula, optic nerve, vitreous, vessels</li>
            <li>Disease templates: glaucoma, cataract, DR, hypertensive, uveitis, corneal, neuro, peds, low vision</li>
            <li>Imaging: fundus photo, OCT, OCTA, visual field, topography, pachymetry, biometry, keratometry</li>
            <li>Optical Prescription and Surgery, Tele-ophthalmology</li>
          </ul>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold">Workflow</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">1. Triage and VA</div><div className="text-ink-muted">Front desk + technician</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">2. Refraction and IOP</div><div className="text-ink-muted">Optometrist</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">3. Slit-Lamp and Fundus</div><div className="text-ink-muted">Ophthalmologist</div></div>
            <div className="rounded-lg bg-surface-sunken p-3"><div className="font-medium">4. Imaging and Diagnosis</div><div className="text-ink-muted">OCT/OCTA, advisory decision support</div></div>
          </div>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold">Interoperability</h3>
          <div className="mt-3 text-sm text-ink-muted space-y-2">
            <div>DICOM and DICOMweb — PACS integration, OCT manufacturers adapter.</div>
            <div>FHIR EyeCare: Observation (VA, IOP), Condition (glaucoma), Procedure (cataract surgery).</div>
            <div>Noelia Ophthalmology AI: informational, recommendation, warning — all require human confirmation.</div>
            <div className="mt-4 rounded-lg bg-accent/10 p-3 text-accent text-xs font-medium">BEYU HEALTH OS differentiator — ophthalmology is first-class, not an add-on.</div>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-lg bg-navy-900 p-4 text-white text-xs">API: POST /api/v1/ophthalmology/exams | GET /api/v1/ophthalmology/exams/:id | Analytics disease patterns | Optical prescriptions | Imaging (OCT/FUNDUS/VF).</div>
    </div>
  );
}
