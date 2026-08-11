
/**
 * ADA Service Animal disclaimer rendered beneath the Pet Policy field
 * group on every detail layout that exposes pet_options.
 * Plain React (no Mantine) — ported from nearby-admin.
 */
export default function ServiceAnimalAlert() {
  return (
    <aside className="poi_service_animal_alert" role="note" aria-label="Service Animals">
      <h4 className="poi_service_animal_alert_title">Service Animals</h4>
      <p className="poi_service_animal_alert_body">
        Under Title II and Title III of the Americans with Disabilities Act
        (ADA), service animals are permitted in all areas where members of
        the public are allowed to go, regardless of the venue's general pet
        policy. A service animal is a
        dog (or in some cases a miniature horse) individually trained to
        perform work or tasks for a person with a disability. Emotional
        support, comfort, or therapy animals are not classified as service
        animals under the ADA.
      </p>
    </aside>
  );
}
